import { InvitationKind, SubjectKind } from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { SessionsRepository } from '../auth/sessions.repository';
import { UsersService } from './users.service';
import { auditLog, invitations, subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('UsersService', () => {
  let testDb: TestDatabase;
  let service: UsersService;
  let sessions: SessionsRepository;
  let admin: { userId: string; subjectId: string };
  let target: { userId: string; subjectId: string };

  beforeAll(async () => {
    testDb = await startTestDatabase();
    sessions = new SessionsRepository(testDb.db);
    service = new UsersService(testDb.db, sessions, new AuditService());
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    const [adminUser] = await testDb.db
      .insert(users)
      .values({
        subjectId: adminSubject!.id,
        email: 'admin@cairn.local',
        isSuperadmin: true,
        passwordHash: 'хэш',
      })
      .returning();
    admin = { userId: adminUser!.id, subjectId: adminSubject!.id };

    const [targetSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    const [targetUser] = await testDb.db
      .insert(users)
      .values({ subjectId: targetSubject!.id, email: 'user@cairn.local', passwordHash: 'хэш' })
      .returning();
    target = { userId: targetUser!.id, subjectId: targetSubject!.id };
  });

  const actor = () => ({ id: admin.subjectId, label: 'admin@cairn.local' });

  describe('list', () => {
    it('возвращает всех пользователей', async () => {
      expect(await service.list()).toHaveLength(2);
    });

    it('сообщает, есть ли действующий пароль', async () => {
      await testDb.db.update(users).set({ passwordHash: null }).where(eq(users.id, target.userId));

      const rows = await service.list();

      expect(rows.find((row) => row.id === target.userId)?.hasPassword).toBe(false);
    });

    it('не отдаёт хэш пароля и секрет второго фактора', async () => {
      // Секреты не попадают в списочные ответы (ТЗ 9).
      const [row] = await service.list();

      expect(JSON.stringify(row)).not.toContain('хэш');
      expect(row).not.toHaveProperty('passwordHash');
      expect(row).not.toHaveProperty('totpSecretEncrypted');
    });

    it('показывает вид последней ссылки', async () => {
      await testDb.db.insert(invitations).values({
        userId: target.userId,
        tokenHash: 'хэш-токена',
        kind: InvitationKind.PasswordReset,
        expiresAt: new Date(Date.now() + 10_000),
      });

      const rows = await service.list();

      expect(rows.find((row) => row.id === target.userId)?.lastLinkKind).toBe(
        InvitationKind.PasswordReset,
      );
    });

    it('отражает отзыв субъекта', async () => {
      await testDb.db
        .update(subjects)
        .set({ revokedAt: new Date() })
        .where(eq(subjects.id, target.subjectId));

      const rows = await service.list();

      expect(rows.find((row) => row.id === target.userId)?.isRevoked).toBe(true);
    });
  });

  describe('revoke', () => {
    it('помечает субъект отозванным', async () => {
      await service.revoke(actor(), target.userId);

      const [subject] = await testDb.db
        .select()
        .from(subjects)
        .where(eq(subjects.id, target.subjectId));

      expect(subject?.revokedAt).not.toBeNull();
    });

    it('завершает сессии отозванного', async () => {
      // Отзыв должен закрывать доступ немедленно (спека 4.5).
      const token = await sessions.create(testDb.db, target.subjectId, {});

      await service.revoke(actor(), target.userId);

      expect(await sessions.findActive(token)).toBeNull();
    });

    it('записывает число завершённых сессий в журнал', async () => {
      await sessions.create(testDb.db, target.subjectId, {});

      await service.revoke(actor(), target.userId);

      const [entry] = await testDb.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, AuditAction.SubjectRevoked));

      expect(entry?.metadata).toMatchObject({ revokedSessions: 1 });
    });

    it('не позволяет отозвать самого себя', async () => {
      // Иначе единственный суперадмин способен закрыть систему навсегда.
      await expect(service.revoke(actor(), admin.userId)).rejects.toThrow(/себя/i);
    });
  });

  describe('restore', () => {
    it('снимает отзыв', async () => {
      await service.revoke(actor(), target.userId);
      await service.restore(actor(), target.userId);

      const [subject] = await testDb.db
        .select()
        .from(subjects)
        .where(eq(subjects.id, target.subjectId));

      expect(subject?.revokedAt).toBeNull();
    });

    it('не возвращает завершённые сессии', async () => {
      // Восстановление даёт право войти заново, а не оживляет старый доступ.
      const token = await sessions.create(testDb.db, target.subjectId, {});
      await service.revoke(actor(), target.userId);
      await service.restore(actor(), target.userId);

      expect(await sessions.findActive(token)).toBeNull();
    });
  });

  describe('resetTotp', () => {
    it('снимает привязку второго фактора', async () => {
      await testDb.db
        .update(users)
        .set({ isTotpEnabled: true, totpSecretEncrypted: 'v1:a:b:c' })
        .where(eq(users.id, target.userId));

      await service.resetTotp(actor(), target.userId);

      const [user] = await testDb.db.select().from(users).where(eq(users.id, target.userId));

      expect(user?.isTotpEnabled).toBe(false);
      expect(user?.totpSecretEncrypted).toBeNull();
    });

    it('пишет сброс в журнал', async () => {
      await service.resetTotp(actor(), target.userId);

      const [entry] = await testDb.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, AuditAction.TotpReset));

      expect(entry).toBeDefined();
    });
  });
});
