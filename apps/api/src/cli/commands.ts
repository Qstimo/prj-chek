import { AuditSubjectKind, InvitationKind, SubjectKind } from '@cairn/shared';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { PasswordService } from '../auth/password.service';
import { SessionsRepository } from '../auth/sessions.repository';
import { generateToken, hashToken } from '../auth/token';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { invitations, subjects, users } from '../db/schema';
import { InvitationsService } from '../invitations/invitations.service';
import type { IssuedLink } from '../invitations/invitations.types';

/**
 * Команды консоли (спека 6.5, 6.6).
 *
 * Требуют доступа к серверу, то есть уже предполагают владение машиной,
 * и потому не ослабляют модель безопасности. Каждый вызов пишется в журнал
 * как системное действие — у него нет субъекта.
 */
@Injectable()
export class CliCommands {
  /**
   * Токены внедрения проставлены явно: команда запускается через `tsx`,
   * который не эмитит метаданные типов параметров (`emitDecoratorMetadata`
   * не поддерживается его транспилятором esbuild), и Nest без явного токена
   * не резолвит зависимость по одному лишь TypeScript-типу параметра.
   */
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(InvitationsService) private readonly invitationsService: InvitationsService,
    @Inject(SessionsRepository) private readonly sessions: SessionsRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * Создаёт первого суперадмина и возвращает ссылку на установку пароля.
   *
   * Пароль не принимается аргументом: он остался бы в истории оболочки
   * и в списке процессов.
   */
  async createSuperadmin(email: string): Promise<IssuedLink> {
    const normalized = email.toLowerCase();

    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(users)
        .where(eq(users.email, normalized))
        .limit(1);

      if (existing) {
        throw new ConflictException(`Пользователь ${normalized} уже существует`);
      }

      const [subject] = await tx
        .insert(subjects)
        .values({ kind: SubjectKind.User, label: normalized })
        .returning();

      const [user] = await tx
        .insert(users)
        .values({ subjectId: subject!.id, email: normalized, isSuperadmin: true })
        .returning();

      const link = await this.issueLink(tx, user!.id, InvitationKind.Invitation);

      await this.audit.record(tx, systemActor('cli create-superadmin'), {
        action: AuditAction.SuperadminCreated,
        entityType: 'user',
        entityId: user!.id,
        metadata: { email: normalized },
      });

      return link;
    });
  }

  /** Снимает привязку второго фактора. */
  async resetTotp(email: string): Promise<void> {
    const user = await this.requireUser(email);

    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ isTotpEnabled: false, totpSecretEncrypted: null, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      await this.audit.record(tx, systemActor('cli reset-totp'), {
        action: AuditAction.TotpReset,
        entityType: 'user',
        entityId: user.id,
      });
    });
  }

  /**
   * Обнуляет пароль, завершает сессии и выдаёт ссылку.
   *
   * Выполняет ту же транзакцию, что и сброс через интерфейс (спека 4.6),
   * но не требует находиться в системе — этим и решается тупик, когда
   * единственный суперадмин потерял пароль.
   */
  async resetPassword(email: string): Promise<IssuedLink> {
    const user = await this.requireUser(email);

    return this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash: null, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      const revokedSessions = await this.sessions.revokeAllForSubject(tx, user.subjectId);
      const link = await this.issueLink(tx, user.id, InvitationKind.PasswordReset);

      await this.audit.record(tx, systemActor('cli reset-password'), {
        action: AuditAction.PasswordResetRequested,
        entityType: 'user',
        entityId: user.id,
        metadata: { revokedSessions },
      });

      return link;
    });
  }

  /**
   * Выдаёт одноразовую ссылку, погасив прежние.
   *
   * Повторяет логику одноимённого метода сервиса приглашений намеренно:
   * тот требует пригласившего пользователя, а у действия с консоли его нет.
   * Выносить общий код в третье место ради двух вызовов не стоит — связь
   * между ними и так закреплена тестами на обеих сторонах.
   */
  private async issueLink(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    userId: string,
    kind: InvitationKind,
  ): Promise<IssuedLink> {
    await tx
      .update(invitations)
      .set({ expiresAt: new Date(0) })
      .where(eq(invitations.userId, userId));

    const token = generateToken();
    const expiresAt = new Date(Date.now() + LINK_TTL_MS);

    await tx.insert(invitations).values({
      userId,
      tokenHash: hashToken(token),
      kind,
      expiresAt,
    });

    return { token, userId, expiresAt };
  }

  /** Находит пользователя по адресу либо сообщает, что его нет. */
  private async requireUser(email: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user) {
      throw new NotFoundException(`Пользователь ${email} не найден`);
    }

    return user;
  }
}

/** Строит действующее лицо для действия с консоли. */
function systemActor(command: string) {
  return { kind: AuditSubjectKind.System as const, id: null, label: command };
}

/** Срок жизни ссылки, выданной с консоли, — сутки. */
const LINK_TTL_MS = 24 * 60 * 60 * 1000;
