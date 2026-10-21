import { EnvironmentKind, HealthState, SubjectKind } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import { domains, environmentDomains, environments, projects, subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';
import { IncidentsRepository } from './incidents.repository';
import { IncidentEventKind, IncidentsService, type AddressState } from './incidents.service';

describe('сведение инцидентов', () => {
  let testDb: TestDatabase;
  let service: IncidentsService;
  let projectId: string;
  let domainId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new IncidentsService(new IncidentsRepository(testDb.db, new AccessService(testDb.db)));
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
    await testDb.db
      .insert(users)
      .values({ subjectId: subject!.id, email: 'admin@cairn.local', passwordHash: 'хэш' });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'CAIRN' })
      .returning();
    projectId = project!.id;

    const [environment] = await testDb.db
      .insert(environments)
      .values({ projectId, name: 'прод', kind: EnvironmentKind.Production })
      .returning();
    const [root] = await testDb.db.insert(domains).values({ name: 'project.ru' }).returning();
    const [address] = await testDb.db
      .insert(environmentDomains)
      .values({ environmentId: environment!.id, domainId: root!.id, name: 'project.ru' })
      .returning();
    domainId = address!.id;
  });

  /** Состояние упавшего адреса. */
  const downState = (): AddressState => ({
    domainId,
    name: 'project.ru',
    projectId,
    projectName: 'CAIRN',
    environmentName: 'прод',
    isPaused: false,
    health: HealthState.Down,
    healthError: 'HTTP 500',
  });

  /** Состояние того же адреса, когда он ответил. */
  const upState = (): AddressState => ({
    ...downState(),
    health: HealthState.Up,
    healthError: null,
  });

  it('падение даёт событие открытия с причиной', async () => {
    const events = await service.reconcile([downState()]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: IncidentEventKind.Opened, cause: 'HTTP 500' });
  });

  it('повторный прогон при том же падении событий не даёт', async () => {
    await service.reconcile([downState()]);

    expect(await service.reconcile([downState()])).toEqual([]);
  });

  it('ответивший адрес даёт событие закрытия с длительностью', async () => {
    await service.reconcile([downState()]);

    const events = await service.reconcile([upState()]);

    expect(events[0]?.kind).toBe(IncidentEventKind.Resolved);
    expect(events[0]?.startedAt).toBeInstanceOf(Date);
    expect(events[0]?.resolvedAt).toBeInstanceOf(Date);
  });

  it('закрытие несёт причину падения, а не пустоту', async () => {
    // У ответившего адреса причины нет: она лежит в строке инцидента.
    await service.reconcile([downState()]);

    const events = await service.reconcile([upState()]);

    expect(events[0]?.cause).toBe('HTTP 500');
  });

  it('событие несёт имя проекта и окружения для текста уведомления', async () => {
    const events = await service.reconcile([downState()]);

    expect(events[0]).toMatchObject({ projectName: 'CAIRN', environmentName: 'прод' });
  });

  it('приостановленный проект событий не даёт', async () => {
    expect(await service.reconcile([{ ...downState(), isPaused: true }])).toEqual([]);
  });

  it('падение одного адреса не мешает свести остальные', async () => {
    // Адрес с несуществующим идентификатором уронит запись, но второй
    // адрес обязан быть сведён.
    const events = await service.reconcile([
      { ...downState(), domainId: '00000000-0000-0000-0000-0000000000ff' },
      downState(),
    ]);

    expect(events).toHaveLength(1);
  });
});
