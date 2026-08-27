import { SubjectKind } from '@cairn/shared';
import { randomBytes } from 'node:crypto';

import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { authenticator } from 'otplib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { CryptoService } from '../crypto/crypto.service';
import { AuthService } from './auth.service';
import { LoginAttemptsService } from './login-attempts.service';
import { PasswordService } from './password.service';
import { SessionsRepository } from './sessions.repository';
import { TotpService } from './totp.service';
import type { RequestSubject } from '../access/access.types';
import { auditLog, subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('привязка второго фактора', () => {
  let testDb: TestDatabase;
  let service: AuthService;
  let subjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const crypto = new CryptoService(randomBytes(32).toString('base64'));

    service = new AuthService(
      testDb.db,
      new PasswordService(),
      new TotpService(crypto),
      new SessionsRepository(testDb.db),
      new LoginAttemptsService(),
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
    subjectId = subject!.id;

    await testDb.db.insert(users).values({
      subjectId,
      email: 'admin@cairn.local',
      passwordHash: 'хэш',
      isSuperadmin: true,
    });
  });

  const subject = (): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'admin@cairn.local',
    isSuperadmin: true,
    isRevoked: false,
  });

  it('выдаёт ссылку для приложения-аутентификатора', async () => {
    const setup = await service.setupTotp(subject());

    expect(setup.keyUri).toMatch(/^otpauth:\/\/totp\//);
  });

  it('сохраняет секрет зашифрованным до подтверждения', async () => {
    await service.setupTotp(subject());

    const [user] = await testDb.db.select().from(users).where(eq(users.subjectId, subjectId));

    expect(user?.totpSecretEncrypted?.startsWith('v1:')).toBe(true);
  });

  it('не включает второй фактор до подтверждения', async () => {
    // Иначе неудачная привязка заперла бы человека снаружи: секрет есть,
    // а приложение он настроить не успел.
    await service.setupTotp(subject());

    const [user] = await testDb.db.select().from(users).where(eq(users.subjectId, subjectId));

    expect(user?.isTotpEnabled).toBe(false);
  });

  it('включает второй фактор при верном коде', async () => {
    const setup = await service.setupTotp(subject());

    await service.confirmTotp(subject(), authenticator.generate(setup.secret));

    const [user] = await testDb.db.select().from(users).where(eq(users.subjectId, subjectId));

    expect(user?.isTotpEnabled).toBe(true);
  });

  it('отвергает неверный код и не включает фактор', async () => {
    await service.setupTotp(subject());

    await expect(service.confirmTotp(subject(), '000000')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    const [user] = await testDb.db.select().from(users).where(eq(users.subjectId, subjectId));

    expect(user?.isTotpEnabled).toBe(false);
  });

  it('пишет включение в журнал', async () => {
    const setup = await service.setupTotp(subject());

    await service.confirmTotp(subject(), authenticator.generate(setup.secret));

    const [entry] = await testDb.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, AuditAction.TotpEnabled));

    expect(entry).toBeDefined();
  });

  it('отказывается подтверждать без начатой привязки', async () => {
    await expect(service.confirmTotp(subject(), '123456')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('отказывается начинать привязку, когда фактор уже включён', async () => {
    // Перепривязка через этот путь позволила бы владельцу сессии заменить
    // чужой второй фактор; для замены есть сброс администратором (спека 6.6).
    const setup = await service.setupTotp(subject());
    await service.confirmTotp(subject(), authenticator.generate(setup.secret));

    await expect(service.setupTotp(subject())).rejects.toBeInstanceOf(BadRequestException);
  });
});
