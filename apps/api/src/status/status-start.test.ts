import { describe, expect, it, vi } from 'vitest';

import { StatusRunOutcome, StatusRunnerService } from './status-runner.service';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function runnerWithLock(execute: () => Promise<{ locked: boolean }[]>) {
  const lockDb = { transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({ execute }),
  };
  const runner = new StatusRunnerService(lockDb as never, {} as never, {} as never, {} as never, {} as never);
  const sweep = vi.spyOn(runner as unknown as { sweep: () => Promise<void> }, 'sweep');
  return { runner, sweep };
}

describe('подтверждение ручного запуска', () => {
  it('не подтверждает запуск до замка и не ждёт сетевого обхода', async () => {
    const lock = deferred<{ locked: boolean }[]>();
    const network = deferred<void>();
    const { runner, sweep } = runnerWithLock(() => lock.promise);
    sweep.mockReturnValue(network.promise);
    let accepted = false;
    const started = runner.start().then(outcome => { accepted = true; return outcome; });
    await Promise.resolve();
    expect(accepted).toBe(false);
    expect(sweep).not.toHaveBeenCalled();
    expect(await runner.start()).toBe(StatusRunOutcome.Busy);
    lock.resolve([{ locked: true }]);
    expect(await started).toBe(StatusRunOutcome.Accepted);
    expect(sweep).toHaveBeenCalledOnce();
    let drained = false;
    const shutdown = runner.onModuleDestroy().then(() => { drained = true; });
    await Promise.resolve();
    expect(drained).toBe(false);
    network.resolve();
    await shutdown;
    expect(drained).toBe(true);
  });

  it('пустой быстрый обход тоже подтверждается после замка и освобождает запуск', async () => {
    const { runner, sweep } = runnerWithLock(async () => [{ locked: true }]);
    sweep.mockResolvedValue();
    expect(await runner.start()).toBe(StatusRunOutcome.Accepted);
    await runner.settled();
    expect(await runner.start()).toBe(StatusRunOutcome.Accepted);
    await runner.settled();
    expect(sweep).toHaveBeenCalledTimes(2);
  });

  it('занятый чужой замок не подтверждает запуск и не начинает обход', async () => {
    const { runner, sweep } = runnerWithLock(async () => [{ locked: false }]);
    expect(await runner.start()).toBe(StatusRunOutcome.Busy);
    await runner.settled();
    expect(sweep).not.toHaveBeenCalled();
  });

  it('ошибка получения замка отклоняет запуск и освобождает локальный признак', async () => {
    const { runner, sweep } = runnerWithLock(vi.fn()
      .mockRejectedValueOnce(new Error('база недоступна'))
      .mockResolvedValue([{ locked: true }]));
    sweep.mockResolvedValue();
    await expect(runner.start()).rejects.toThrow('база недоступна');
    expect(await runner.start()).toBe(StatusRunOutcome.Accepted);
    await runner.settled();
  });
});
