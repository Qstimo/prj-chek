import { InvitationKind, SubjectKind } from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { PasswordService } from '../auth/password.service';
import { SessionsRepository } from '../auth/sessions.repository';
import { InvitationsService } from './invitations.service';
import { auditLog, invitations, sessions, subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('сброс пароля', () => {
  let testDb: TestDatabase;
  let service: InvitationsService;
  let sessionsRepository: SessionsRepository;
  let admin: { id: string; subjectId: string };
  let target: { id: string; subjectId: string };

  beforeAll(async () => {
    testDb = await startTestDatabase();
    sessionsRepository = new SessionsRepository(testDb.db);
    service = new InvitationsService(
      testDb.db,
      new PasswordService(),
      sessionsRepository,
      new AuditService(),
    );
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
      .values({ subjectId: adminSubject!.id, email: 'admin@cairn.local', isSuperadmin: true })
      .returning();
    admin = { id: adminUser!.id, subjectId: adminSubject!.id };

    const [targetSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    const [targetUser] = await testDb.db
      .insert(users)
      .values({
        subjectId: targetSubject!.id,
        email: 'user@cairn.local',
        passwordHash: await new PasswordService().hash('старый пароль'),
      })
      .returning();
    target = { id: targetUser!.id, subjectId: targetSubject!.id };
  });

  const actor = () => ({ id: admin.subjectId, label: 'admin@cairn.local', userId: admin.id });

  it('обнуляет пароль', async () => {
    await service.resetPassword(actor(), target.id);

    const [user] = await testDb.db.select().from(users).where(eq(users.id, target.id));

    expect(user?.passwordHash).toBeNull();
  });

  it('завершает все сессии пользователя', async () => {
    // Иначе сброс пароля не закрывал бы уже открытый доступ (спека 4.6).
    const token = await sessionsRepository.create(testDb.db, target.subjectId, {});

    await service.resetPassword(actor(), target.id);

    expect(await sessionsRepository.findActive(token)).toBeNull();
  });

  it('не трогает сессии других пользователей', async () => {
    const adminToken = await sessionsRepository.create(testDb.db, admin.subjectId, {});

    await service.resetPassword(actor(), target.id);

    expect(await sessionsRepository.findActive(adminToken)).not.toBeNull();
  });

  it('помечает ссылку как сброс пароля', async () => {
    await service.resetPassword(actor(), target.id);

    const [link] = await testDb.db.select().from(invitations);

    expect(link?.kind).toBe(InvitationKind.PasswordReset);
  });

  it('записывает число завершённых сессий в журнал', async () => {
    await sessionsRepository.create(testDb.db, target.subjectId, {});
    await sessionsRepository.create(testDb.db, target.subjectId, {});

    await service.resetPassword(actor(), target.id);

    const [entry] = await testDb.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, AuditAction.PasswordResetRequested));

    expect(entry?.metadata).toMatchObject({ revokedSessions: 2 });
  });

  it('после сброса вход по старому паролю невозможен', async () => {
    await service.resetPassword(actor(), target.id);

    const [user] = await testDb.db.select().from(users).where(eq(users.id, target.id));

    expect(user?.passwordHash).toBeNull();
  });
});

describe('приём ссылки', () => {
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

  it('выдаёт сессию, если второй фактор не привязан', async () => {
    const link = await service.invite(actor(), 'new@cairn.local');

    const { sessionToken } = await service.acceptLink(link.token, 'очень длинный пароль', {});

    expect(sessionToken).not.toBeNull();
  });

  it('не выдаёт сессию, если второй фактор привязан', async () => {
    // Иначе ссылка сброса стала бы обходом второго фактора (спека 4.6).
    const link = await service.invite(actor(), 'new@cairn.local');
    await testDb.db.update(users).set({ isTotpEnabled: true }).where(eq(users.id, link.userId));

    const { sessionToken } = await service.acceptLink(link.token, 'очень длинный пароль', {});

    expect(sessionToken).toBeNull();
  });

  it('гасит ссылку после использования', async () => {
    const link = await service.invite(actor(), 'new@cairn.local');
    await service.acceptLink(link.token, 'очень длинный пароль', {});

    await expect(service.acceptLink(link.token, 'другой пароль', {})).rejects.toThrow();
  });

  it('отвергает истёкшую ссылку', async () => {
    const link = await service.invite(actor(), 'new@cairn.local');
    await testDb.db.update(invitations).set({ expiresAt: new Date(0) });

    await expect(service.acceptLink(link.token, 'очень длинный пароль', {})).rejects.toThrow();
  });

  it('отвергает неизвестный токен', async () => {
    await expect(service.acceptLink('нет такого', 'очень длинный пароль', {})).rejects.toThrow();
  });
});
