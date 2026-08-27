import { AuditSubjectKind, SubjectKind } from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { PasswordService } from '../auth/password.service';
import { SessionsRepository } from '../auth/sessions.repository';
import { CryptoService } from '../crypto/crypto.service';
import { InvitationsService } from '../invitations/invitations.service';
import { CliCommands } from './commands';
import { auditLog, subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('CliCommands', () => {
  let testDb: TestDatabase;
  let commands: CliCommands;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const passwords = new PasswordService();
    const sessions = new SessionsRepository(testDb.db);

    commands = new CliCommands(
      testDb.db,
      passwords,
      new InvitationsService(testDb.db, passwords, sessions, new AuditService()),
      sessions,
      new AuditService(),
    );
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();
  });

  describe('createSuperadmin', () => {
    it('создаёт субъект и пользователя с признаком суперадмина', async () => {
      await commands.createSuperadmin('admin@cairn.local');

      const [user] = await testDb.db.select().from(users);

      expect(user?.isSuperadmin).toBe(true);
      expect(user?.email).toBe('admin@cairn.local');
    });

    it('возвращает ссылку на установку пароля', async () => {
      // Пароль не передаётся аргументом команды: он остался бы в истории оболочки.
      const link = await commands.createSuperadmin('admin@cairn.local');

      expect(link.token).toBeTruthy();
    });

    it('пишет действие в журнал как системное', async () => {
      // У действия с консоли нет субъекта (спека 4.7).
      await commands.createSuperadmin('admin@cairn.local');

      const [entry] = await testDb.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, AuditAction.SuperadminCreated));

      expect(entry?.subjectId).toBeNull();
      expect(entry?.subjectKind).toBe(AuditSubjectKind.System);
      expect(entry?.subjectLabel).toContain('cli');
    });

    it('отказывается создавать второго с тем же адресом', async () => {
      await commands.createSuperadmin('admin@cairn.local');

      await expect(commands.createSuperadmin('admin@cairn.local')).rejects.toThrow();
    });
  });

  describe('resetTotp', () => {
    it('снимает привязку второго фактора', async () => {
      await commands.createSuperadmin('admin@cairn.local');
      await testDb.db.update(users).set({ isTotpEnabled: true, totpSecretEncrypted: 'v1:a:b:c' });

      await commands.resetTotp('admin@cairn.local');

      const [user] = await testDb.db.select().from(users);

      expect(user?.isTotpEnabled).toBe(false);
    });

    it('пишет сброс в журнал как системное действие', async () => {
      await commands.createSuperadmin('admin@cairn.local');

      await commands.resetTotp('admin@cairn.local');

      const [entry] = await testDb.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, AuditAction.TotpReset));

      expect(entry?.subjectKind).toBe(AuditSubjectKind.System);
    });

    it('сообщает о неизвестном адресе', async () => {
      await expect(commands.resetTotp('никого@cairn.local')).rejects.toThrow(/не найден/i);
    });
  });

  describe('resetPassword', () => {
    it('обнуляет пароль и выдаёт ссылку', async () => {
      const created = await commands.createSuperadmin('admin@cairn.local');
      await testDb.db.update(users).set({ passwordHash: 'хэш' });
      expect(created.token).toBeTruthy();

      const link = await commands.resetPassword('admin@cairn.local');

      const [user] = await testDb.db.select().from(users);

      expect(user?.passwordHash).toBeNull();
      expect(link.token).toBeTruthy();
    });

    it('завершает сессии', async () => {
      await commands.createSuperadmin('admin@cairn.local');
      const [subject] = await testDb.db.select().from(subjects);
      const sessions = new SessionsRepository(testDb.db);
      const token = await sessions.create(testDb.db, subject!.id, {});

      await commands.resetPassword('admin@cairn.local');

      expect(await sessions.findActive(token)).toBeNull();
    });
  });
});
