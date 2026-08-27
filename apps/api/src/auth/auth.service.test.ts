import { AuditSubjectKind, SubjectKind } from '@cairn/shared';
import { randomBytes } from 'node:crypto';

import { UnauthorizedException } from '@nestjs/common';
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
import { auditLog, subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

const ORIGIN = { ip: '10.0.0.1', userAgent: 'браузер' };

describe('AuthService.login', () => {
  let testDb: TestDatabase;
  let service: AuthService;
  let totp: TotpService;
  let passwords: PasswordService;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    // Новый экземпляр на каждый тест: ограничитель попыток хранит состояние
    // в памяти процесса (реальное время, без поддельных таймеров), и блокировка,
    // выставленная одним тестом, иначе пережила бы его и ломала бы соседние.
    passwords = new PasswordService();
    totp = new TotpService(new CryptoService(randomBytes(32).toString('base64')));
    service = new AuthService(
      testDb.db,
      passwords,
      totp,
      new SessionsRepository(testDb.db),
      new LoginAttemptsService(),
      new AuditService(),
    );
  });

  async function createUser(options: { password?: string; withTotp?: boolean } = {}) {
    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();

    const secret = options.withTotp ? totp.createSecret('user@cairn.local') : null;

    const [user] = await testDb.db
      .insert(users)
      .values({
        subjectId: subject!.id,
        email: 'user@cairn.local',
        passwordHash: options.password ? await passwords.hash(options.password) : null,
        totpSecretEncrypted: secret?.encryptedSecret ?? null,
        isTotpEnabled: Boolean(secret),
      })
      .returning();

    return { user: user!, subject: subject!, secret };
  }

  it('выдаёт сессию при верном пароле без второго фактора', async () => {
    await createUser({ password: 'пароль' });

    const outcome = await service.login('user@cairn.local', 'пароль', ORIGIN);

    expect(outcome.kind).toBe('session');
  });

  it('выдаёт челлендж при включённом втором факторе', async () => {
    await createUser({ password: 'пароль', withTotp: true });

    const outcome = await service.login('user@cairn.local', 'пароль', ORIGIN);

    expect(outcome.kind).toBe('totp_required');
  });

  it('отвергает неверный пароль', async () => {
    await createUser({ password: 'пароль' });

    await expect(service.login('user@cairn.local', 'не тот', ORIGIN)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('одинаково отвечает на несуществующий адрес', async () => {
    // Различие в ответах позволило бы перебором выяснить состав
    // пользователей (спека 6.2).
    await createUser({ password: 'пароль' });

    const wrongPassword = await service
      .login('user@cairn.local', 'не тот', ORIGIN)
      .catch((error: Error) => error.message);
    const unknownEmail = await service
      .login('никого@cairn.local', 'не тот', ORIGIN)
      .catch((error: Error) => error.message);

    expect(wrongPassword).toBe(unknownEmail);
  });

  it('одинаково отвечает пользователю без действующего пароля', async () => {
    await createUser();

    const noPassword = await service
      .login('user@cairn.local', 'любой', ORIGIN)
      .catch((error: Error) => error.message);
    const unknownEmail = await service
      .login('никого@cairn.local', 'любой', ORIGIN)
      .catch((error: Error) => error.message);

    expect(noPassword).toBe(unknownEmail);
  });

  it('отказывает отозванному субъекту', async () => {
    const { subject } = await createUser({ password: 'пароль' });
    await testDb.db.update(subjects).set({ revokedAt: new Date() });

    await expect(service.login('user@cairn.local', 'пароль', ORIGIN)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(subject.id).toBeDefined();
  });

  it('блокирует после десяти неудач и отвечает так же, как при неверном пароле', async () => {
    await createUser({ password: 'пароль' });

    for (let index = 0; index < 10; index += 1) {
      await service.login('user@cairn.local', 'не тот', ORIGIN).catch(() => undefined);
    }

    const blocked = await service
      .login('user@cairn.local', 'пароль', ORIGIN)
      .catch((error: Error) => error.message);
    const unknownEmail = await service
      .login('никого@cairn.local', 'любой', { ip: '10.0.0.9' })
      .catch((error: Error) => error.message);

    expect(blocked).toBe(unknownEmail);
  });

  it('пишет успешный вход в журнал', async () => {
    await createUser({ password: 'пароль' });

    await service.login('user@cairn.local', 'пароль', ORIGIN);

    const [entry] = await testDb.db.select().from(auditLog);

    expect(entry?.action).toBe(AuditAction.LoginSucceeded);
    expect(entry?.subjectKind).toBe(AuditSubjectKind.User);
  });

  it('пишет неудачную попытку в журнал', async () => {
    await createUser({ password: 'пароль' });

    await service.login('user@cairn.local', 'не тот', ORIGIN).catch(() => undefined);

    const [entry] = await testDb.db.select().from(auditLog);

    expect(entry?.action).toBe(AuditAction.LoginFailed);
  });

  it('не пишет в журнал попытку с несуществующим адресом', async () => {
    // Субъекта нет, а запись вида system исказила бы картину: журнал
    // фиксирует действия над системой, а не любой шум на входе.
    await service.login('никого@cairn.local', 'любой', ORIGIN).catch(() => undefined);

    expect(await testDb.db.select().from(auditLog)).toHaveLength(0);
  });
});

describe('AuthService.verifyTotp', () => {
  let testDb: TestDatabase;
  let service: AuthService;
  let totp: TotpService;
  let passwords: PasswordService;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    passwords = new PasswordService();
    totp = new TotpService(new CryptoService(randomBytes(32).toString('base64')));
    service = new AuthService(
      testDb.db,
      passwords,
      totp,
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
  });

  async function loginWithTotp(): Promise<{ challengeToken: string; secret: string }> {
    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    const created = totp.createSecret('user@cairn.local');

    await testDb.db.insert(users).values({
      subjectId: subject!.id,
      email: 'user@cairn.local',
      passwordHash: await passwords.hash('пароль'),
      totpSecretEncrypted: created.encryptedSecret,
      isTotpEnabled: true,
    });

    const outcome = await service.login('user@cairn.local', 'пароль', ORIGIN);

    if (outcome.kind !== 'totp_required') {
      throw new Error('ожидался челлендж второго фактора');
    }

    return { challengeToken: outcome.challengeToken, secret: created.secret };
  }

  it('выдаёт сессию при верном коде', async () => {
    const { challengeToken, secret } = await loginWithTotp();

    const token = await service.verifyTotp(challengeToken, authenticator.generate(secret), ORIGIN);

    expect(typeof token).toBe('string');
  });

  it('отвергает неверный код', async () => {
    const { challengeToken } = await loginWithTotp();

    await expect(service.verifyTotp(challengeToken, '000000', ORIGIN)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('исчерпывает челлендж после пяти неудач', async () => {
    const { challengeToken, secret } = await loginWithTotp();

    for (let index = 0; index < 5; index += 1) {
      await service.verifyTotp(challengeToken, '000000', ORIGIN).catch(() => undefined);
    }

    await expect(
      service.verifyTotp(challengeToken, authenticator.generate(secret), ORIGIN),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('не принимает челлендж повторно', async () => {
    const { challengeToken, secret } = await loginWithTotp();
    await service.verifyTotp(challengeToken, authenticator.generate(secret), ORIGIN);

    await expect(
      service.verifyTotp(challengeToken, authenticator.generate(secret), ORIGIN),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('отвергает неизвестный челлендж', async () => {
    await expect(service.verifyTotp('нет такого', '123456', ORIGIN)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
