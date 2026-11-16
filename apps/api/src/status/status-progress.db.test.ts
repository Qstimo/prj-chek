import { StatusIndicator } from '@cairn/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AccessService } from '../access/access.service';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';
import { StatusRepository } from './status.repository';

const LOCK_CLASS = 0x4341_4952;
const LOCK_OBJECT = 1;

describe('состояние прогона по замку PostgreSQL', () => {
  let testDb: TestDatabase;
  let reader: StatusRepository;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    // Читаем ролью приложения с другого соединения, чем держатель замка.
    reader = new StatusRepository(testDb.appDb, new AccessService(testDb.appDb));
  });

  afterAll(async () => {
    await testDb?.stop();
  });

  it('без замка прогон не идёт', async () => {
    expect(await reader.isCheckRunning()).toBe(false);
  });

  it('видит точный замок другого соединения до конца транзакции', async () => {
    expect(await reader.isCheckRunning()).toBe(false);
    await testDb.db.transaction(async tx => {
      const rows = await tx.execute(sql`
        select pg_try_advisory_xact_lock(${LOCK_CLASS}, ${LOCK_OBJECT}) as locked
      `);
      expect(rows[0]?.locked).toBe(true);
      expect(await reader.isCheckRunning()).toBe(true);
      // Повторное чтение не снимает замок и не требует суперпользователя.
      expect(await reader.isCheckRunning()).toBe(true);
    });
    expect(await reader.isCheckRunning()).toBe(false);
  });

  it('после отката транзакции прогон больше не идёт', async () => {
    const aborted = new Error('откат прогона');
    await expect(testDb.db.transaction(async tx => {
      await tx.execute(sql`select pg_try_advisory_xact_lock(${LOCK_CLASS}, ${LOCK_OBJECT})`);
      expect(await reader.isCheckRunning()).toBe(true);
      throw aborted;
    })).rejects.toThrow(aborted);
    expect(await reader.isCheckRunning()).toBe(false);
  });

  it.each([
    ['другой класс', sql`select pg_advisory_xact_lock(${LOCK_CLASS + 1}, ${LOCK_OBJECT})`],
    ['другой объект', sql`select pg_advisory_xact_lock(${LOCK_CLASS}, ${LOCK_OBJECT + 1})`],
    // В pg_locks числовые части совпадают, но objsubid у bigint-ключа равен 1.
    ['одночисловой ключ', sql`select pg_advisory_xact_lock(${(BigInt(LOCK_CLASS) << 32n) + 1n}::bigint)`],
  ])('не принимает чужой замок за прогон: %s', async (_name, lock) => {
    await testDb.db.transaction(async tx => {
      await tx.execute(lock);
      expect(await reader.isCheckRunning()).toBe(false);
    });
    expect(await reader.isCheckRunning()).toBe(false);
  });

  it('не объявляет старый снимок итогом при завершении реального прогона посреди чтения', async () => {
    let release!: () => void;
    let ready!: () => void;
    const released = new Promise<void>(resolve => { release = resolve; });
    const acquired = new Promise<void>(resolve => { ready = resolve; });
    const holding = testDb.db.transaction(async tx => {
      await tx.execute(sql`select pg_try_advisory_xact_lock(${LOCK_CLASS}, ${LOCK_OBJECT})`);
      ready();
      await released;
    });
    await acquired;
    const repository = new StatusRepository(testDb.appDb, { requireLevel: vi.fn() } as never);
    const stale = { indicator: StatusIndicator.Unknown, environments: [], domains: [], warnings: [], registryWarnings: [] };
    vi.spyOn(repository as unknown as { buildStatus: () => Promise<typeof stale> }, 'buildStatus')
      .mockImplementationOnce(async () => {
        release();
        await holding;
        return stale;
      }).mockResolvedValue({ ...stale, indicator: StatusIndicator.Ok });
    try {
      expect((await repository.statusForProject({} as never, 'id')).checkRunning).toBe(true);
      expect(await repository.statusForProject({} as never, 'id')).toMatchObject({
        indicator: StatusIndicator.Ok, checkRunning: false,
      });
    } finally {
      release();
      await holding;
    }
  });

});
