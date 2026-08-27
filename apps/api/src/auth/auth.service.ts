import { AuditSubjectKind } from '@cairn/shared';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';

import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { subjects, totpChallenges, users, type User } from '../db/schema';
import type { LoginOutcome } from './auth.types';
import { LoginAttemptsService } from './login-attempts.service';
import { PasswordService } from './password.service';
import { SessionsRepository, type SessionOrigin } from './sessions.repository';
import { generateToken, hashToken } from './token';
import { TotpService } from './totp.service';

/**
 * Вход в систему (спека 6.1).
 *
 * Вход двухшаговый: проверка пароля и, если второй фактор привязан, проверка
 * кода. Разделение позволяет считать неудачи кода отдельно от неудач пароля
 * и не смешивать два разных состояния в одном ответе.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly passwords: PasswordService,
    private readonly totp: TotpService,
    private readonly sessions: SessionsRepository,
    private readonly attempts: LoginAttemptsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Проверяет пароль.
   *
   * Возвращает либо готовую сессию, либо челлендж второго фактора.
   * Все отказы неразличимы: одинаковое сообщение получают неверный пароль,
   * несуществующий адрес, исчерпанный лимит попыток и пользователь без
   * действующего пароля (спека 6.2).
   */
  async login(email: string, password: string, origin: SessionOrigin): Promise<LoginOutcome> {
    const ip = origin.ip ?? 'unknown';

    if (this.attempts.isBlocked(email, ip)) {
      throw new UnauthorizedException(FAILURE_MESSAGE);
    }

    const found = await this.findActiveUser(email);

    if (!found || !found.passwordHash) {
      this.attempts.registerFailure(email, ip);
      throw new UnauthorizedException(FAILURE_MESSAGE);
    }

    if (!(await this.passwords.verify(found.passwordHash, password))) {
      this.attempts.registerFailure(email, ip);
      await this.db.transaction(async (tx) => {
        await this.audit.record(tx, this.actorFor(found), { action: AuditAction.LoginFailed });
      });

      throw new UnauthorizedException(FAILURE_MESSAGE);
    }

    this.attempts.registerSuccess(email, ip);

    if (found.isTotpEnabled) {
      return { kind: 'totp_required', challengeToken: await this.createChallenge(found.id) };
    }

    return { kind: 'session', token: await this.startSession(found, origin) };
  }

  /**
   * Проверяет код второго фактора и выдаёт сессию.
   *
   * Пять неудачных попыток исчерпывают челлендж, после чего вход
   * начинается заново с пароля (спека 6.2).
   */
  async verifyTotp(challengeToken: string, code: string, origin: SessionOrigin): Promise<string> {
    const [challenge] = await this.db
      .select()
      .from(totpChallenges)
      .where(
        and(
          eq(totpChallenges.tokenHash, hashToken(challengeToken)),
          isNull(totpChallenges.consumedAt),
          gt(totpChallenges.expiresAt, new Date()),
          sql`${totpChallenges.attempts} < ${MAX_TOTP_ATTEMPTS}`,
        ),
      )
      .limit(1);

    if (!challenge) {
      throw new UnauthorizedException(FAILURE_MESSAGE);
    }

    const found = await this.findActiveUserById(challenge.userId);

    if (!found?.totpSecretEncrypted || !this.totp.verify(found.totpSecretEncrypted, code)) {
      await this.db.transaction(async (tx) => {
        await tx
          .update(totpChallenges)
          .set({ attempts: challenge.attempts + 1 })
          .where(eq(totpChallenges.id, challenge.id));

        if (found) {
          await this.audit.record(tx, this.actorFor(found), {
            action:
              challenge.attempts + 1 >= MAX_TOTP_ATTEMPTS
                ? AuditAction.TotpChallengeExhausted
                : AuditAction.TotpFailed,
          });
        }
      });

      throw new UnauthorizedException(FAILURE_MESSAGE);
    }

    await this.db
      .update(totpChallenges)
      .set({ consumedAt: new Date() })
      .where(eq(totpChallenges.id, challenge.id));

    return this.startSession(found, origin);
  }

  /** Создаёт сессию и пишет успешный вход в журнал в одной транзакции. */
  private async startSession(user: ActiveUser, origin: SessionOrigin): Promise<string> {
    return this.db.transaction(async (tx) => {
      const token = await this.sessions.create(tx, user.subjectId, origin);

      await this.audit.record(tx, this.actorFor(user), { action: AuditAction.LoginSucceeded });

      return token;
    });
  }

  /** Создаёт короткоживущий челлендж второго фактора. */
  private async createChallenge(userId: string): Promise<string> {
    const token = generateToken();

    await this.db.insert(totpChallenges).values({
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    });

    return token;
  }

  /** Находит пользователя с неотозванным субъектом по адресу. */
  private async findActiveUser(email: string): Promise<ActiveUser | null> {
    const [found] = await this.db
      .select({ user: users, subjectLabel: subjects.label })
      .from(users)
      .innerJoin(subjects, eq(subjects.id, users.subjectId))
      .where(and(eq(users.email, email.toLowerCase()), isNull(subjects.revokedAt)))
      .limit(1);

    return found ? { ...found.user, subjectLabel: found.subjectLabel } : null;
  }

  /** Находит пользователя с неотозванным субъектом по идентификатору. */
  private async findActiveUserById(userId: string): Promise<ActiveUser | null> {
    const [found] = await this.db
      .select({ user: users, subjectLabel: subjects.label })
      .from(users)
      .innerJoin(subjects, eq(subjects.id, users.subjectId))
      .where(and(eq(users.id, userId), isNull(subjects.revokedAt)))
      .limit(1);

    return found ? { ...found.user, subjectLabel: found.subjectLabel } : null;
  }

  /** Строит действующее лицо для журнала. */
  private actorFor(user: ActiveUser) {
    return {
      kind: AuditSubjectKind.User as const,
      id: user.subjectId,
      label: user.subjectLabel,
    };
  }
}

/** Пользователь с меткой его субъекта. */
type ActiveUser = User & { subjectLabel: string };

/**
 * Единое сообщение об отказе.
 *
 * Одинаково для всех причин: различия позволили бы перебором выяснить
 * состав пользователей и то, кто из них заблокирован.
 */
const FAILURE_MESSAGE = 'Неверный адрес или пароль';

/** Предел попыток кода второго фактора. */
const MAX_TOTP_ATTEMPTS = 5;

/** Срок жизни челленджа — 5 минут (спека 4.8). */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
