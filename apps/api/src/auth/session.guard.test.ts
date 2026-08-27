import { SubjectKind } from '@cairn/shared';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { SessionGuard } from './session.guard';
import { SessionsRepository } from './sessions.repository';
import { SESSION_COOKIE } from './session.cookie';
import { subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

interface FakeRequest {
  cookies: Record<string, string>;
  subject?: unknown;
}

function contextWith(request: FakeRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('SessionGuard', () => {
  let testDb: TestDatabase;
  let guard: SessionGuard;
  let sessionsRepository: SessionsRepository;
  let subjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    sessionsRepository = new SessionsRepository(testDb.db);
    guard = new SessionGuard(testDb.db, sessionsRepository);
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    subjectId = subject!.id;

    await testDb.db
      .insert(users)
      .values({ subjectId, email: 'user@cairn.local', isSuperadmin: false });
  });

  it('отклоняет запрос без cookie', async () => {
    await expect(guard.canActivate(contextWith({ cookies: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('отклоняет неизвестный токен', async () => {
    await expect(
      guard.canActivate(contextWith({ cookies: { [SESSION_COOKIE]: 'нет такого' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('пропускает живую сессию и кладёт субъект в запрос', async () => {
    const token = await sessionsRepository.create(testDb.db, subjectId, {});
    const request: FakeRequest = { cookies: { [SESSION_COOKIE]: token } };

    expect(await guard.canActivate(contextWith(request))).toBe(true);
    expect(request.subject).toMatchObject({ id: subjectId, isSuperadmin: false });
  });

  it('отражает признак суперадмина', async () => {
    await testDb.db.update(users).set({ isSuperadmin: true });
    const token = await sessionsRepository.create(testDb.db, subjectId, {});
    const request: FakeRequest = { cookies: { [SESSION_COOKIE]: token } };

    await guard.canActivate(contextWith(request));

    expect(request.subject).toMatchObject({ isSuperadmin: true });
  });

  it('отклоняет сессию отозванного субъекта', async () => {
    // Отзыв завершает сессии, но проверка нужна и здесь: она защищает
    // от сессии, созданной в тот же момент другим путём.
    const token = await sessionsRepository.create(testDb.db, subjectId, {});
    await testDb.db.update(subjects).set({ revokedAt: new Date() });

    await expect(
      guard.canActivate(contextWith({ cookies: { [SESSION_COOKIE]: token } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('отклоняет отозванную сессию', async () => {
    const token = await sessionsRepository.create(testDb.db, subjectId, {});
    await sessionsRepository.revoke(testDb.db, token);

    await expect(
      guard.canActivate(contextWith({ cookies: { [SESSION_COOKIE]: token } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
