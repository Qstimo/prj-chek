import { EnvironmentKind, HealthState, SubjectKind } from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import {
  auditLog,
  domainStatuses,
  domains,
  environmentDomains,
  environments,
  projects,
  subjects,
  users,
} from '../db/schema';
import { StatusRepository } from './status.repository';
import { StatusRunnerService } from './status-runner.service';
import { StatusService } from './status.service';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('runner статусов', () => {
  let testDb: TestDatabase;
  let repository: StatusRepository;
  let projectId: string;
  let subjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new StatusRepository(testDb.db, new AccessService(testDb.db));
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

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;
  });

  const admin = (): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'admin@cairn.local',
    isSuperadmin: true,
    isRevoked: false,
  });

  async function seedTargets(): Promise<void> {
    const [environment] = await testDb.db
      .insert(environments)
      .values({
        projectId,
        name: 'Прод',
        kind: EnvironmentKind.Production,
        healthCheckPath: '/api/health',
      })
      .returning();
    const [root] = await testDb.db.insert(domains).values({ name: 'example.com' }).returning();
    await testDb.db.insert(environmentDomains).values([
      { environmentId: environment!.id, domainId: root!.id, name: 'example.com' },
      { environmentId: environment!.id, domainId: root!.id, name: 'stage.example.com' },
    ]);
  }

  /** Проверщики, отвечающие без отказов. */
  function healthyCheckers() {
    return {
      checkHealth: vi
        .fn()
        .mockResolvedValue({ health: HealthState.Up, latencyMs: 42, error: null }),
      checkTls: vi
        .fn()
        .mockResolvedValue({ validTo: new Date('2027-01-01T00:00:00Z'), error: null }),
      checkDomainExpiry: vi
        .fn()
        .mockResolvedValue({ expiresAt: new Date('2027-06-01T00:00:00Z'), error: null }),
    };
  }

  it('по каждому адресу делает все три проверки', async () => {
    await seedTargets();

    const checkers = healthyCheckers();
    const runner = new StatusRunnerService(repository, checkers);

    await runner.runAll();

    expect(checkers.checkHealth).toHaveBeenCalledWith('stage.example.com', '/api/health');
    expect(checkers.checkTls).toHaveBeenCalledWith('stage.example.com');
    expect(checkers.checkDomainExpiry).toHaveBeenCalledWith('stage.example.com');
  });

  it('прогон пишет три проверки одной строкой на адрес', async () => {
    await seedTargets();

    const runner = new StatusRunnerService(repository, healthyCheckers());

    await runner.runAll();

    const rows = await testDb.db.select().from(domainStatuses);
    const [status] = rows;

    expect(rows).toHaveLength(2);
    expect(status).toMatchObject({ health: HealthState.Up, latencyMs: 42 });
    expect(status?.tlsValidTo?.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(status?.registryExpiresAt?.toISOString()).toBe('2027-06-01T00:00:00.000Z');
  });

  it('окружение без пути проверяется по корню', async () => {
    await seedTargets();
    await testDb.db.update(environments).set({ healthCheckPath: null });

    const checkers = healthyCheckers();

    await new StatusRunnerService(repository, checkers).runAll();

    expect(checkers.checkHealth).toHaveBeenCalledWith('example.com', null);
  });

  it('падение одного адреса не прерывает обход', async () => {
    await seedTargets();

    const checkers = healthyCheckers();
    // Проверщики не бросают по контракту, но runner обязан пережить
    // даже нарушение этого контракта.
    checkers.checkHealth.mockRejectedValueOnce(new Error('взорвалось'));

    await new StatusRunnerService(repository, checkers).runAll();

    const rows = await testDb.db.select().from(domainStatuses);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ health: HealthState.Up });
  });

  it('ручной запуск пишет в журнал, фоновый — нет', async () => {
    const runner = new StatusRunnerService(repository, {
      checkHealth: vi.fn(),
      checkTls: vi.fn(),
      checkDomainExpiry: vi.fn(),
    });
    const service = new StatusService(testDb.db, repository, runner, new AuditService());

    await runner.runAll();
    expect(
      await testDb.db.select().from(auditLog).where(eq(auditLog.action, AuditAction.StatusCheckRun)),
    ).toHaveLength(0);

    await service.runNow(admin());
    expect(
      await testDb.db.select().from(auditLog).where(eq(auditLog.action, AuditAction.StatusCheckRun)),
    ).toHaveLength(1);
  });
});
