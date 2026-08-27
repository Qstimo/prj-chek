import { SubjectKind } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { SessionsRepository } from './sessions.repository';
import { generateToken } from './token';
import { sessions, subjects } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('SessionsRepository', () => {
  let testDb: TestDatabase;
  let repository: SessionsRepository;
  let subjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new SessionsRepository(testDb.db);
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'пользователь' })
      .returning();
    subjectId = subject!.id;
  });

  describe('create', () => {
    it('возвращает токен и не хранит его открытым', async () => {
      const token = await repository.create(testDb.db, subjectId, {});

      const [stored] = await testDb.db.select().from(sessions);

      expect(stored?.tokenHash).not.toBe(token);
    });

    it('сохраняет источник запроса', async () => {
      await repository.create(testDb.db, subjectId, { ip: '10.0.0.1', userAgent: 'браузер' });

      const [stored] = await testDb.db.select().from(sessions);

      expect(stored?.ip).toBe('10.0.0.1');
      expect(stored?.userAgent).toBe('браузер');
    });
  });

  describe('findActive', () => {
    it('находит живую сессию по токену', async () => {
      const token = await repository.create(testDb.db, subjectId, {});

      expect(await repository.findActive(token)).toMatchObject({ subjectId });
    });

    it('не находит по неизвестному токену', async () => {
      expect(await repository.findActive(generateToken())).toBeNull();
    });

    it('не находит отозванную сессию', async () => {
      const token = await repository.create(testDb.db, subjectId, {});
      await repository.revoke(testDb.db, token);

      expect(await repository.findActive(token)).toBeNull();
    });

    it('не находит истёкшую сессию', async () => {
      const token = await repository.create(testDb.db, subjectId, {}, new Date(Date.now() - 1000));

      expect(await repository.findActive(token)).toBeNull();
    });
  });

  describe('revokeAllForSubject', () => {
    it('завершает все сессии субъекта и возвращает их число', async () => {
      // Отзыв субъекта обязан немедленно закрывать доступ (спека 4.5).
      await repository.create(testDb.db, subjectId, {});
      await repository.create(testDb.db, subjectId, {});

      expect(await repository.revokeAllForSubject(testDb.db, subjectId)).toBe(2);
    });

    it('не трогает сессии других субъектов', async () => {
      const [other] = await testDb.db
        .insert(subjects)
        .values({ kind: SubjectKind.User, label: 'другой' })
        .returning();
      const otherToken = await repository.create(testDb.db, other!.id, {});
      await repository.create(testDb.db, subjectId, {});

      await repository.revokeAllForSubject(testDb.db, subjectId);

      expect(await repository.findActive(otherToken)).not.toBeNull();
    });

    it('не считает уже отозванные сессии повторно', async () => {
      const token = await repository.create(testDb.db, subjectId, {});
      await repository.revoke(testDb.db, token);

      expect(await repository.revokeAllForSubject(testDb.db, subjectId)).toBe(0);
    });
  });
});
