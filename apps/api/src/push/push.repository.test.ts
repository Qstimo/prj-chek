import { SubjectKind, type PushSubscribeRequest } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';
import { PushRepository } from './push.repository';

const SUBSCRIPTION: PushSubscribeRequest = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  p256dh: 'ключ',
  auth: 'секрет',
};

describe('репозиторий подписок', () => {
  let testDb: TestDatabase;
  let repository: PushRepository;
  let subjectId: string;
  let otherSubjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new PushRepository(testDb.db);
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
    await testDb.db
      .insert(users)
      .values({ subjectId, email: 'admin@cairn.local', passwordHash: 'хэш' });

    const [other] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'other@cairn.local' })
      .returning();
    otherSubjectId = other!.id;
    await testDb.db
      .insert(users)
      .values({ subjectId: otherSubjectId, email: 'other@cairn.local', passwordHash: 'хэш' });
  });

  it('заводит подписку субъекта', async () => {
    await repository.save(subjectId, SUBSCRIPTION);

    expect(await repository.forSubjects([subjectId])).toHaveLength(1);
  });

  it('повторная подписка тем же адресом обновляет ключи, а не плодит строку', async () => {
    // Браузер пересоздаёт подписку сам, когда служба меняет ключи.
    await repository.save(subjectId, SUBSCRIPTION);
    await repository.save(subjectId, { ...SUBSCRIPTION, p256dh: 'новый' });

    const stored = await repository.forSubjects([subjectId]);

    expect(stored).toHaveLength(1);
    expect(stored[0]?.p256dh).toBe('новый');
  });

  it('чужой адрес подписки не переходит к другому субъекту', async () => {
    // Молчаливая передача владения означала бы, что чужое устройство
    // начнёт получать имена моих проектов и адресов: endpoint секретный,
    // но тихо менять адресата всё равно нельзя.
    await repository.save(otherSubjectId, SUBSCRIPTION);

    await expect(repository.save(subjectId, SUBSCRIPTION)).rejects.toThrow();

    expect(await repository.forSubjects([otherSubjectId])).toHaveLength(1);
    expect(await repository.forSubjects([subjectId])).toHaveLength(0);
  });

  it('снимает только свою подписку', async () => {
    await repository.save(subjectId, SUBSCRIPTION);

    await repository.remove(otherSubjectId, SUBSCRIPTION.endpoint);

    expect(await repository.forSubjects([subjectId])).toHaveLength(1);
  });

  it('снимает свою подписку по адресу', async () => {
    await repository.save(subjectId, SUBSCRIPTION);

    await repository.remove(subjectId, SUBSCRIPTION.endpoint);

    expect(await repository.forSubjects([subjectId])).toHaveLength(0);
  });

  it('подписки чужих субъектов не отдаются', async () => {
    await repository.save(otherSubjectId, SUBSCRIPTION);

    expect(await repository.forSubjects([subjectId])).toHaveLength(0);
  });

  it('пустой список субъектов не превращается в выборку всех', async () => {
    // Иначе падение проекта без адресатов ушло бы всем подряд.
    await repository.save(subjectId, SUBSCRIPTION);

    expect(await repository.forSubjects([])).toHaveLength(0);
  });

  it('мёртвая подписка удаляется по идентификатору', async () => {
    await repository.save(subjectId, SUBSCRIPTION);
    const [stored] = await repository.forSubjects([subjectId]);

    await repository.drop(stored!.id);

    expect(await repository.forSubjects([subjectId])).toHaveLength(0);
  });
});
