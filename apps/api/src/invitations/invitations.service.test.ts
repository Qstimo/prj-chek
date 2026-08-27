import { InvitationKind, SubjectKind } from '@cairn/shared';
import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { PasswordService } from '../auth/password.service';
import { SessionsRepository } from '../auth/sessions.repository';
import { hashToken } from '../auth/token';
import { InvitationsService } from './invitations.service';
import { auditLog, invitations, subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('InvitationsService.invite', () => {
  let testDb: TestDatabase;
  let service: InvitationsService;
  let admin: { id: string; subjectId: string };

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new InvitationsService(
      testDb.db,
      new PasswordService(),
      new SessionsRepository(testDb.db),
      new AuditService(),
    );
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    const [user] = await testDb.db
      .insert(users)
      .values({ subjectId: subject!.id, email: 'admin@cairn.local', isSuperadmin: true })
      .returning();

    admin = { id: user!.id, subjectId: subject!.id };
  });

  const actor = () => ({ id: admin.subjectId, label: 'admin@cairn.local', userId: admin.id });

  describe('неизвестный адрес', () => {
    it('создаёт субъект, пользователя и ссылку', async () => {
      const link = await service.invite(actor(), 'new@cairn.local');

      expect(link.token).toBeTruthy();
      expect(await testDb.db.select().from(users)).toHaveLength(2);
    });

    it('создаёт субъект сразу, чтобы доступы можно было выдать заранее', async () => {
      // Матрица доступов должна быть полной до первого входа (спека 4.6).
      await service.invite(actor(), 'new@cairn.local');

      expect(await testDb.db.select().from(subjects)).toHaveLength(2);
    });

    it('не хранит токен открытым', async () => {
      const link = await service.invite(actor(), 'new@cairn.local');

      const [stored] = await testDb.db.select().from(invitations);

      expect(stored?.tokenHash).toBe(hashToken(link.token));
      expect(stored?.tokenHash).not.toBe(link.token);
    });

    it('помечает ссылку как приглашение', async () => {
      await service.invite(actor(), 'new@cairn.local');

      const [stored] = await testDb.db.select().from(invitations);

      expect(stored?.kind).toBe(InvitationKind.Invitation);
    });

    it('пишет создание в журнал', async () => {
      await service.invite(actor(), 'new@cairn.local');

      const [entry] = await testDb.db.select().from(auditLog);

      expect(entry?.action).toBe(AuditAction.InvitationCreated);
    });
  });

  describe('адрес известен, пароль не задан', () => {
    it('переиспользует пользователя и выдаёт новую ссылку', async () => {
      await service.invite(actor(), 'new@cairn.local');
      await service.invite(actor(), 'new@cairn.local');

      expect(await testDb.db.select().from(users)).toHaveLength(2);
      expect(await testDb.db.select().from(invitations)).toHaveLength(2);
    });

    it('гасит предыдущую ссылку', async () => {
      // Иначе две живые ссылки на одну учётную запись расширяют поверхность атаки.
      const first = await service.invite(actor(), 'new@cairn.local');
      await service.invite(actor(), 'new@cairn.local');

      expect(await service.findUsableLink(first.token)).toBeNull();
    });

    it('пишет повторную выдачу отдельным событием', async () => {
      // Спека 7.2 требует различать создание и повторную выдачу.
      await service.invite(actor(), 'new@cairn.local');
      await service.invite(actor(), 'new@cairn.local');

      const entries = await testDb.db.select().from(auditLog);

      expect(entries.map((entry) => entry.action)).toEqual([
        AuditAction.InvitationCreated,
        AuditAction.InvitationReissued,
      ]);
    });
  });

  describe('адрес известен, пользователь активен', () => {
    it('отклоняет приглашение', async () => {
      // Молчаливое превращение приглашения в сброс обнулило бы пароль
      // работающему человеку (спека 4.6).
      const link = await service.invite(actor(), 'new@cairn.local');
      await service.acceptLink(link.token, 'очень длинный пароль', {});

      await expect(service.invite(actor(), 'new@cairn.local')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('сообщает, что нужен сброс пароля', async () => {
      const link = await service.invite(actor(), 'new@cairn.local');
      await service.acceptLink(link.token, 'очень длинный пароль', {});

      await expect(service.invite(actor(), 'new@cairn.local')).rejects.toThrow(/сброс/i);
    });
  });
});
