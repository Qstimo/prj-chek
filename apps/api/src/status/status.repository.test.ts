import {
  AccessLevel,
  EnvironmentKind,
  HealthState,
  Section,
  StatusIndicator,
  SubjectKind,
} from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import { SectionNotVisibleError } from '../access/access.errors';
import type { RequestSubject } from '../access/access.types';
import {
  environmentDomains,
  environmentStatuses,
  environments,
  grants,
  projects,
  subjects,
  users,
} from '../db/schema';
import { StatusRepository } from './status.repository';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('репозиторий статусов', () => {
  let testDb: TestDatabase;
  let repository: StatusRepository;
  let projectId: string;
  let environmentId: string;
  let domainId: string;
  let subjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new StatusRepository(testDb.db, new AccessService(testDb.db));
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    const [admin] = await testDb.db
      .insert(users)
      .values({
        subjectId: adminSubject!.id,
        email: 'admin@cairn.local',
        passwordHash: 'хэш',
        isSuperadmin: true,
      })
      .returning();
    adminUserId = admin!.id;

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    subjectId = subject!.id;
    await testDb.db
      .insert(users)
      .values({ subjectId, email: 'user@cairn.local', passwordHash: 'хэш' });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;

    const [environment] = await testDb.db
      .insert(environments)
      .values({
        projectId,
        name: 'Прод',
        kind: EnvironmentKind.Production,
        healthCheckUrl: 'https://example.com/health',
      })
      .returning();
    environmentId = environment!.id;

    const [domain] = await testDb.db
      .insert(environmentDomains)
      .values({ environmentId, name: 'example.com' })
      .returning();
    domainId = domain!.id;
  });

  const member = (): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'user@cairn.local',
    isSuperadmin: false,
    isRevoked: false,
  });

  async function grantInfra(level: AccessLevel): Promise<void> {
    await testDb.db.insert(grants).values({
      subjectId,
      projectId,
      section: Section.Infrastructure,
      level,
      grantedBy: adminUserId,
    });
  }

  it('повторная запись статуса обновляет строку, а не плодит', async () => {
    await repository.upsertEnvironmentStatus(environmentId, {
      health: HealthState.Down,
      latencyMs: null,
      error: 'HTTP 500',
    });
    await repository.upsertEnvironmentStatus(environmentId, {
      health: HealthState.Up,
      latencyMs: 42,
      error: null,
    });

    const rows = await testDb.db.select().from(environmentStatuses);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ health: HealthState.Up, latencyMs: 42 });
  });

  it('перечисляет цели проверок', async () => {
    const targets = await repository.listTargets();

    expect(targets.environments).toEqual([
      { id: environmentId, healthCheckUrl: 'https://example.com/health' },
    ]);
    expect(targets.domains).toEqual([{ id: domainId, name: 'example.com' }]);
  });

  it('собирает статус проекта по уровню метаданных', async () => {
    await repository.upsertEnvironmentStatus(environmentId, {
      health: HealthState.Up,
      latencyMs: 42,
      error: null,
    });
    await grantInfra(AccessLevel.Metadata);

    const status = await repository.statusForProject(member(), projectId);

    expect(status.indicator).toBe(StatusIndicator.Ok);
    expect(status.environments[0]).toMatchObject({ name: 'Прод', health: HealthState.Up });
    expect(status.domains[0]).toMatchObject({ name: 'example.com', tlsValidTo: null });
  });

  it('без выдачи на инфраструктуру статус недоступен', async () => {
    await expect(repository.statusForProject(member(), projectId)).rejects.toBeInstanceOf(
      SectionNotVisibleError,
    );
  });

  it('непроверенный проект имеет индикатор «неизвестно»', async () => {
    await grantInfra(AccessLevel.Metadata);

    const status = await repository.statusForProject(member(), projectId);

    expect(status.indicator).toBe(StatusIndicator.Unknown);
    expect(status.environments[0]!.health).toBeNull();
  });

  it('сводка не содержит проектов без инфраструктурного уровня', async () => {
    // Есть доступ к «Инфо», но не к инфраструктуре — статус не раскрывается.
    await testDb.db.insert(grants).values({
      subjectId,
      projectId,
      section: Section.Info,
      level: AccessLevel.Read,
      grantedBy: adminUserId,
    });

    expect(await repository.summary(member())).toEqual([]);

    await grantInfra(AccessLevel.Metadata);

    const summary = await repository.summary(member());
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({ projectId, projectName: 'Проект' });
  });
});
