import { AuditSubjectKind, InvitationKind, type UserRow } from '@cairn/shared';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq, isNull } from 'drizzle-orm';

import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { SessionsRepository } from '../auth/sessions.repository';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { invitations, subjects, users } from '../db/schema';

/** Суперадмин, выполняющий действие. */
export interface ManagingActor {
  /** Идентификатор его субъекта. */
  id: string;
  label: string;
}

/**
 * Управление пользователями (спека 9.1).
 *
 * Все методы доступны только суперадмину; это проверяет guard на контроллере,
 * поэтому здесь проверок прав нет (спека 8).
 */
@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly sessions: SessionsRepository,
    private readonly audit: AuditService,
  ) {}

  /**
   * Возвращает список пользователей.
   *
   * Хэш пароля и секрет второго фактора не попадают в ответ: секреты
   * не должны появляться в списочных ответах (ТЗ 9).
   */
  async list(): Promise<UserRow[]> {
    const rows = await this.db
      .select({
        id: users.id,
        subjectId: users.subjectId,
        subjectKind: subjects.kind,
        email: users.email,
        isSuperadmin: users.isSuperadmin,
        isTotpEnabled: users.isTotpEnabled,
        passwordHash: users.passwordHash,
        revokedAt: subjects.revokedAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .innerJoin(subjects, eq(subjects.id, users.subjectId))
      .orderBy(users.createdAt);

    const lastLinks = await this.lastLinkKinds();

    return rows.map((row) => ({
      id: row.id,
      subjectId: row.subjectId,
      subjectKind: row.subjectKind,
      email: row.email,
      isSuperadmin: row.isSuperadmin,
      isTotpEnabled: row.isTotpEnabled,
      hasPassword: row.passwordHash !== null,
      isRevoked: row.revokedAt !== null,
      lastLinkKind: lastLinks.get(row.id) ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Отзывает субъект пользователя и завершает его сессии. */
  async revoke(actor: ManagingActor, userId: string): Promise<void> {
    const user = await this.requireUser(userId);

    if (user.subjectId === actor.id) {
      throw new BadRequestException(
        'Нельзя отозвать самого себя: система осталась бы без администратора.',
      );
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(subjects)
        .set({ revokedAt: new Date() })
        .where(eq(subjects.id, user.subjectId));

      const revokedSessions = await this.sessions.revokeAllForSubject(tx, user.subjectId);

      await this.audit.record(tx, this.actorFor(actor), {
        action: AuditAction.SubjectRevoked,
        entityType: 'user',
        entityId: userId,
        metadata: { revokedSessions },
      });
    });
  }

  /**
   * Снимает отзыв.
   *
   * Завершённые сессии не восстанавливаются: восстановление возвращает право
   * войти заново, а не оживляет прежний доступ.
   */
  async restore(actor: ManagingActor, userId: string): Promise<void> {
    const user = await this.requireUser(userId);

    await this.db.transaction(async (tx) => {
      await tx.update(subjects).set({ revokedAt: null }).where(eq(subjects.id, user.subjectId));

      await this.audit.record(tx, this.actorFor(actor), {
        action: AuditAction.SubjectRestored,
        entityType: 'user',
        entityId: userId,
      });
    });
  }

  /** Снимает привязку второго фактора. */
  async resetTotp(actor: ManagingActor, userId: string): Promise<void> {
    await this.requireUser(userId);

    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ isTotpEnabled: false, totpSecretEncrypted: null, updatedAt: new Date() })
        .where(eq(users.id, userId));

      await this.audit.record(tx, this.actorFor(actor), {
        action: AuditAction.TotpReset,
        entityType: 'user',
        entityId: userId,
      });
    });
  }

  /**
   * Собирает вид последней выданной ссылки по каждому пользователю.
   *
   * Нужен, чтобы отличить приглашённого от того, кому сбросили пароль:
   * в самой записи пользователя этих состояний не различить (спека 4.2).
   */
  private async lastLinkKinds(): Promise<Map<string, InvitationKind>> {
    const rows = await this.db
      .select({ userId: invitations.userId, kind: invitations.kind })
      .from(invitations)
      .where(isNull(invitations.acceptedAt))
      .orderBy(desc(invitations.createdAt));

    const byUser = new Map<string, InvitationKind>();

    for (const row of rows) {
      if (!byUser.has(row.userId)) {
        byUser.set(row.userId, row.kind);
      }
    }

    return byUser;
  }

  /** Находит запись пользователя по его субъекту. */
  async userIdOfSubject(subjectId: string): Promise<string> {
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.subjectId, subjectId))
      .limit(1);

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    return user.id;
  }

  /** Находит пользователя либо бросает «не найдено». */
  private async requireUser(userId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    return user;
  }

  /** Строит действующее лицо для журнала. */
  private actorFor(actor: ManagingActor): AuditActor {
    return { kind: AuditSubjectKind.User, id: actor.id, label: actor.label };
  }
}
