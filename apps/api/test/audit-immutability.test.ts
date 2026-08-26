import { AuditSubjectKind } from '@cairn/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { auditLog } from '../src/db/schema';
import { startTestDatabase, type TestDatabase } from './db-fixture';

describe('неизменяемость журнала', () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();
  });

  it('роль приложения может добавлять записи', async () => {
    // Заодно проверяет, что миграция прав вообще применилась: без неё роль
    // не имела бы доступа к таблице и запрос упал бы.
    await testDb.appDb.insert(auditLog).values({
      subjectKind: AuditSubjectKind.System,
      subjectLabel: 'проверка',
      action: 'test',
    });

    expect(await testDb.appDb.select().from(auditLog)).toHaveLength(1);
  });

  it('роль приложения не может изменять записи', async () => {
    await testDb.appDb.insert(auditLog).values({
      subjectKind: AuditSubjectKind.System,
      subjectLabel: 'проверка',
      action: 'test',
    });

    await expect(
      testDb.appDb.execute(sql`UPDATE audit_log SET action = 'подделка'`),
    ).rejects.toThrow(/permission denied/);
  });

  it('роль приложения не может удалять записи', async () => {
    await testDb.appDb.insert(auditLog).values({
      subjectKind: AuditSubjectKind.System,
      subjectLabel: 'проверка',
      action: 'test',
    });

    await expect(testDb.appDb.execute(sql`DELETE FROM audit_log`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it('роль приложения свободно работает с обычными таблицами', async () => {
    // Ограничение касается только журнала: если бы оно задело остальные
    // таблицы, приложение перестало бы работать целиком.
    await testDb.appDb.execute(sql`
      INSERT INTO subjects (kind, label) VALUES ('user', 'проверка')
    `);
    await testDb.appDb.execute(sql`DELETE FROM subjects`);
  });
});
