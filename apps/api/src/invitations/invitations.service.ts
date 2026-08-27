import { AuditSubjectKind, InvitationKind, SubjectKind } from '@cairn/shared';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';

import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { PasswordService } from '../auth/password.service';
import { SessionsRepository, type SessionOrigin } from '../auth/sessions.repository';
import { generateToken, hashToken } from '../auth/token';
import { DATABASE } from '../db/db.module';
import type { Database, Executor } from '../db/db.types';
import { invitations, subjects, users, type Invitation, type User } from '../db/schema';
import type { IssuedLink } from './invitations.types';

/** Суперадмин, выдающий ссылку. */
export interface InvitingActor {
  /** Идентификатор его субъекта — для журнала. */
  id: string;
  label: string;
  /** Идентификатор его записи пользователя — для поля «кто пригласил». */
  userId: string;
}

/**
 * Одноразовые ссылки на установку пароля: приглашения и сбросы (спека 4.6).
 *
 * Живая ссылка возможна только у пользователя без действующего пароля.
 * Это единственный инвариант, на котором держится безопасность механизма:
 * ссылка на смену пароля активному пользователю была бы обходом входа.
 */
@Injectable()
export class InvitationsService {
  /**
   * Токены внедрения проставлены явно, а не выведены из типов параметров:
   * команды консоли запускаются через `tsx`, который транспилирует файлы
   * через esbuild и не эмитит `design:paramtypes` для `emitDecoratorMetadata`.
   * Без явного токена Nest в этом окружении не резолвит зависимость.
   */
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(SessionsRepository) private readonly sessions: SessionsRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * Приглашает пользователя.
   *
   * Три исхода: неизвестный адрес — создаётся всё с нуля; известный без
   * пароля — выдаётся новая ссылка вместо прежней; активный пользователь —
   * отказ с указанием на сброс пароля.
   */
  async invite(actor: InvitingActor, email: string): Promise<IssuedLink> {
    const normalized = email.toLowerCase();

    return this.db.transaction(async (tx) => {
      const existing = await this.findUserByEmail(tx, normalized);

      if (existing?.passwordHash) {
        throw new ConflictException(
          'Пользователь с таким адресом уже работает в системе. Для смены пароля используйте сброс.',
        );
      }

      const user = existing ?? (await this.createUser(tx, normalized));
      const link = await this.issueLink(tx, user.id, InvitationKind.Invitation, actor.userId);

      await this.audit.record(
        tx,
        { kind: AuditSubjectKind.User, id: actor.id, label: actor.label },
        {
          action: existing ? AuditAction.InvitationReissued : AuditAction.InvitationCreated,
          entityType: 'user',
          entityId: user.id,
          metadata: { email: normalized },
        },
      );

      return link;
    });
  }

  /**
   * Сбрасывает пароль: обнуляет его, завершает сессии и выдаёт ссылку.
   *
   * Все три действия в одной транзакции — иначе при сбое посередине
   * пользователь остался бы без пароля и без способа его задать.
   */
  async resetPassword(actor: InvitingActor, userId: string): Promise<IssuedLink> {
    return this.db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);

      if (!user) {
        throw new NotFoundException('Пользователь не найден');
      }

      await tx.update(users).set({ passwordHash: null, updatedAt: new Date() }).where(eq(users.id, userId));

      const revokedSessions = await this.sessions.revokeAllForSubject(tx, user.subjectId);
      const link = await this.issueLink(tx, userId, InvitationKind.PasswordReset, actor.userId);

      await this.audit.record(
        tx,
        { kind: AuditSubjectKind.User, id: actor.id, label: actor.label },
        {
          action: AuditAction.PasswordResetRequested,
          entityType: 'user',
          entityId: userId,
          metadata: { revokedSessions },
        },
      );

      return link;
    });
  }

  /** Находит действующую ссылку по токену. Возвращает `null`, если она непригодна. */
  async findUsableLink(token: string): Promise<Invitation | null> {
    const [link] = await this.db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.tokenHash, hashToken(token)),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .limit(1);

    return link ?? null;
  }

  /**
   * Устанавливает пароль по ссылке.
   *
   * Возвращает токен сессии либо `null`, если у пользователя привязан второй
   * фактор: тогда вход завершается обычным челленджем, и ссылка не даёт
   * обойти вторую проверку (спека 4.6).
   */
  async acceptLink(
    token: string,
    password: string,
    origin: SessionOrigin,
  ): Promise<{ sessionToken: string | null; user: User }> {
    const link = await this.findUsableLink(token);

    if (!link) {
      throw new NotFoundException('Ссылка недействительна или уже использована');
    }

    return this.db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, link.userId)).limit(1);

      if (!user) {
        throw new NotFoundException('Пользователь не найден');
      }

      await tx
        .update(users)
        .set({ passwordHash: await this.passwords.hash(password), updatedAt: new Date() })
        .where(eq(users.id, user.id));

      await tx
        .update(invitations)
        .set({ acceptedAt: new Date() })
        .where(eq(invitations.id, link.id));

      await this.audit.record(
        tx,
        { kind: AuditSubjectKind.User, id: user.subjectId, label: user.email },
        {
          action:
            link.kind === InvitationKind.PasswordReset
              ? AuditAction.PasswordResetCompleted
              : AuditAction.InvitationAccepted,
          entityType: 'user',
          entityId: user.id,
        },
      );

      if (user.isTotpEnabled) {
        return { sessionToken: null, user };
      }

      return { sessionToken: await this.sessions.create(tx, user.subjectId, origin), user };
    });
  }

  /** Создаёт субъект и пользователя без пароля. */
  private async createUser(tx: Executor, email: string): Promise<User> {
    const [subject] = await tx
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: email })
      .returning();

    const [user] = await tx.insert(users).values({ subjectId: subject!.id, email }).returning();

    return user!;
  }

  /** Гасит прежние ссылки пользователя и выдаёт новую. */
  private async issueLink(
    tx: Executor,
    userId: string,
    kind: InvitationKind,
    invitedBy: string,
  ): Promise<IssuedLink> {
    await tx
      .update(invitations)
      .set({ expiresAt: new Date(0) })
      .where(and(eq(invitations.userId, userId), isNull(invitations.acceptedAt)));

    const token = generateToken();
    const expiresAt = new Date(
      Date.now() + (kind === InvitationKind.Invitation ? INVITATION_TTL_MS : RESET_TTL_MS),
    );

    await tx.insert(invitations).values({
      userId,
      tokenHash: hashToken(token),
      kind,
      invitedBy,
      expiresAt,
    });

    return { token, userId, expiresAt };
  }

  /** Находит пользователя по адресу. */
  private async findUserByEmail(tx: Executor, email: string): Promise<User | null> {
    const [user] = await tx.select().from(users).where(eq(users.email, email)).limit(1);

    return user ?? null;
  }
}

/** Срок жизни приглашения — 72 часа (спека 4.6). */
const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;

/** Срок жизни ссылки сброса — 4 часа: она опаснее приглашения. */
const RESET_TTL_MS = 4 * 60 * 60 * 1000;
