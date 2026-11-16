import { describe, expect, it, vi } from 'vitest';
import { StatusIndicator } from '@cairn/shared';
import { StatusService } from './status.service';
import { StatusRepository } from './status.repository';
import { StatusRunnerService } from './status-runner.service';

const status = { indicator: StatusIndicator.Unknown, domains: [], environments: [], warnings: [], registryWarnings: [] };

describe('authoritative check progress', () => {
  it.each(['manual', 'background', 'startup'])('reads the database lock before, during and after %s runs', async trigger => {
    let locked = false;
    const db = { execute: vi.fn(async () => [{ running: locked }]) };
    const repository = new StatusRepository(db as never, { requireLevel: vi.fn() } as never);
    vi.spyOn(repository as unknown as { buildStatus: () => Promise<typeof status> }, 'buildStatus').mockResolvedValue(status);
    const lockDb = { transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      try {
        return await callback({ execute: async () => { locked = true; return [{ locked: true }]; } });
      } finally { locked = false; }
    } };
    const runner = new StatusRunnerService(lockDb as never, repository, {} as never, {} as never, {} as never);
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    vi.spyOn(runner as unknown as { sweep: () => Promise<void> }, 'sweep').mockReturnValue(pending);
    const service = new StatusService(db as never, repository, runner, {} as never);
    expect((await service.projectStatus({} as never, 'id')).checkRunning).toBe(false);
    if (trigger === 'startup') {
      const previous = process.env.CAIRN_STATUS_CHECK_INTERVAL_MINUTES;
      process.env.CAIRN_STATUS_CHECK_INTERVAL_MINUTES = '15';
      runner.onModuleInit();
      if (previous === undefined) delete process.env.CAIRN_STATUS_CHECK_INTERVAL_MINUTES;
      else process.env.CAIRN_STATUS_CHECK_INTERVAL_MINUTES = previous;
    } else {
      runner.start({ isManual: trigger === 'manual' });
    }
    expect((await service.projectStatus({} as never, 'id')).checkRunning).toBe(true);
    // Another API instance reads the same lock without relying on runner memory.
    const other = new StatusService(db as never, repository, {} as never, {} as never);
    expect((await other.projectStatus({} as never, 'id')).checkRunning).toBe(true);
    finish();
    await runner.onModuleDestroy();
    expect((await other.projectStatus({} as never, 'id')).checkRunning).toBe(false);
  });

  it('keeps polling if the sweep finishes while the aggregate is being read', async () => {
    let running = true;
    const repository = new StatusRepository({} as never, { requireLevel: vi.fn() } as never);
    vi.spyOn(repository, 'isCheckRunning').mockImplementation(async () => running);
    const build = vi.spyOn(repository as unknown as { buildStatus: () => Promise<typeof status> }, 'buildStatus');
    build.mockImplementationOnce(async () => {
      running = false;
      return status; // Снимок прочитан до финальной записи прогона.
    }).mockResolvedValue({ ...status, indicator: StatusIndicator.Ok });
    const service = new StatusService({} as never, repository, {} as never, {} as never);
    expect((await service.projectStatus({} as never, 'id')).checkRunning).toBe(true);
    expect(await service.projectStatus({} as never, 'id')).toMatchObject({ checkRunning: false, indicator: StatusIndicator.Ok });
  });

  it('detects a sweep that starts while the aggregate is being read', async () => {
    let running = false;
    const repository = new StatusRepository({} as never, { requireLevel: vi.fn() } as never);
    vi.spyOn(repository, 'isCheckRunning').mockImplementation(async () => running);
    vi.spyOn(repository as unknown as { buildStatus: () => Promise<typeof status> }, 'buildStatus').mockImplementation(async () => {
      running = true;
      return status;
    });
    expect((await repository.statusForProject({} as never, 'id')).checkRunning).toBe(true);
  });

  it('does not inspect global run state before project access has passed', async () => {
    const repository = new StatusRepository({} as never, {
      requireLevel: vi.fn().mockRejectedValue(new Error('not found')),
    } as never);
    const running = vi.spyOn(repository, 'isCheckRunning');
    const service = new StatusService({} as never, repository, {} as never, {} as never);
    await expect(service.projectStatus({} as never, 'hidden')).rejects.toThrow('not found');
    expect(running).not.toHaveBeenCalled();
  });
});
