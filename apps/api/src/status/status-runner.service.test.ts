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
  environmentDomains,
  environmentStatuses,
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
        healthCheckUrl: 'https://example.com/health',
      })
      .returning();
    await testDb.db
      .insert(environmentDomains)
      .values({ environmentId: environment!.id, name: 'example.com' });
  }

  it('прогон пишет статусы окружений и доменов', async () => {
    await seedTargets();

    const runner = new StatusRunnerService(repository, {
      checkHealth: vi
        .fn()
        .mockResolvedValue({ health: HealthState.Up, latencyMs: 42, error: null }),
      checkTls: vi
        .fn()
        .mockResolvedValue({ validTo: new Date('2027-01-01T00:00:00Z'), error: null }),
      checkDomainExpiry: vi
        .fn()
        .mockResolvedValue({ expiresAt: new Date('2027-06-01T00:00:00Z'), error: null }),
    });

    await runner.runAll();

    const [environmentStatus] = await testDb.db.select().from(environmentStatuses);
    const [domainStatus] = await testDb.db.select().from(domainStatuses);

    expect(environmentStatus).toMatchObject({ health: HealthState.Up, latencyMs: 42 });
    expect(domainStatus?.tlsValidTo?.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(domainStatus?.registryExpiresAt?.toISOString()).toBe('2027-06-01T00:00:00.000Z');
  });

  it('падение одной цели не прерывает обход', async () => {
    await seedTargets();

    const runner = new StatusRunnerService(repository, {
      // Проверщики не бросают по контракту, но runner обязан пережить
      // даже нарушение этого контракта.
      checkHealth: vi.fn().mockRejectedValue(new Error('взорвалось')),
      checkTls: vi.fn().mockResolvedValue({ validTo: null, error: 'нет соединения' }),
      checkDomainExpiry: vi.fn().mockResolvedValue({ expiresAt: null, error: 'нет RDAP' }),
    });

    await runner.runAll();

    const [domainStatus] = await testDb.db.select().from(domainStatuses);
    expect(domainStatus).toMatchObject({ tlsError: 'нет соединения', registryError: 'нет RDAP' });
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
