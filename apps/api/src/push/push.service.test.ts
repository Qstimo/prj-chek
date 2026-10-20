import { SubjectKind, type PushSubscribeRequest } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { auditLog, subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';
import { PushRepository } from './push.repository';
import { PushService } from './push.service';

const SUBSCRIPTION: PushSubscribeRequest = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  p256dh: 'ключ',
  auth: 'секрет',
};

/**
 * Ставит переменные VAPID на время вызова и возвращает прежние.
 *
 * Без восстановления соседние тесты получили бы чужой ключ, и транспорт
 * собрался бы там, где его быть не должно.
 */
function withVapid(
  keys: { public?: string; private?: string; subject?: string },
  body: () => void,
): void {
  const saved = {
    public: process.env.CAIRN_VAPID_PUBLIC_KEY,
    private: process.env.CAIRN_VAPID_PRIVATE_KEY,
    subject: process.env.CAIRN_VAPID_SUBJECT,
  };

  const apply = (values: typeof saved) => {
    const pairs: [string, string | undefined][] = [
      ['CAIRN_VAPID_PUBLIC_KEY', values.public],
      ['CAIRN_VAPID_PRIVATE_KEY', values.private],
      ['CAIRN_VAPID_SUBJECT', values.subject],
    ];

    for (const [name, value] of pairs) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  };

  apply({ public: keys.public, private: keys.private, subject: keys.subject });

  try {
    body();
  } finally {
    apply(saved);
  }
}

describe('служба подписок', () => {
  let testDb: TestDatabase;
  let service: PushService;
  let userSubjectId: string;
  let agentSubjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new PushService(testDb.db, new PushRepository(testDb.db), new AuditService());
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
    userSubjectId = subject!.id;
    await testDb.db
      .insert(users)
      .values({ subjectId: userSubjectId, email: 'admin@cairn.local', passwordHash: 'хэш' });

    const [agent] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.AgentToken, label: 'агент' })
      .returning();
    agentSubjectId = agent!.id;
  });

  const userSubject = (): RequestSubject => ({
    id: userSubjectId,
    kind: SubjectKind.User,
    label: 'admin@cairn.local',
    isSuperadmin: false,
    isRevoked: false,
  });

  const agentSubject = (): RequestSubject => ({
    id: agentSubjectId,
    kind: SubjectKind.AgentToken,
    label: 'агент',
    isSuperadmin: false,
    isRevoked: false,
  });

  it('подписка пишется в журнал', async () => {
    // По образцу totp.enabled: канал несёт имена проектов и адреса,
    // и суперадмину стоит видеть, что устройство его получило.
    await service.subscribe(userSubject(), SUBSCRIPTION);

    const [entry] = await testDb.rowsOf(auditLog);

    expect(entry?.action).toBe(AuditAction.PushSubscribed);
  });

  it('адрес службы в журнал не попадает', async () => {
    // Им владеют как ключом: попав в журнал, он стал бы доступен всем,
    // кто журнал читает.
    await service.subscribe(userSubject(), SUBSCRIPTION);

    const [entry] = await testDb.rowsOf(auditLog);

    expect(JSON.stringify(entry ?? {})).not.toContain(SUBSCRIPTION.endpoint);
  });

  it('снятие подписки тоже пишется в журнал', async () => {
    await service.subscribe(userSubject(), SUBSCRIPTION);
    await service.unsubscribe(userSubject(), SUBSCRIPTION.endpoint);

    const actions = (await testDb.rowsOf(auditLog)).map((entry) => entry.action);

    expect(actions).toContain(AuditAction.PushUnsubscribed);
  });

  it('токен агента подписаться не может', async () => {
    // Браузера у него нет, а субъект в таблице подписок — есть,
    // и без проверки вида там завелась бы бессмысленная строка.
    await expect(service.subscribe(agentSubject(), SUBSCRIPTION)).rejects.toThrow();
  });

  it('публичный ключ отдаётся, когда заданы все три переменные', () => {
    withVapid({ public: 'ключ', private: 'секрет', subject: 'mailto:a@b' }, () => {
      expect(service.publicKey()).toEqual({ publicKey: 'ключ' });
    });
  });

  it('без ключа уведомления объявлены выключенными', () => {
    withVapid({}, () => {
      expect(service.publicKey()).toEqual({ publicKey: null });
    });
  });

  it('публичный ключ без остальных двух — тоже выключено', () => {
    // Иначе интерфейс покажет кнопку, человек подпишется, а отправка
    // молча ничего не сделает: транспорт без всех трёх не собирается.
    withVapid({ public: 'ключ' }, () => {
      expect(service.publicKey()).toEqual({ publicKey: null });
    });
  });
});
