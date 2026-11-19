import { EnvironmentKind, HealthState, SubjectKind } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccessService } from '../access/access.service';
import {
  addressIncidents,
  domains,
  environmentDomains,
  environments,
  projects,
  subjects,
  users,
} from '../db/schema';
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
    isArchived: false,
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

  it('повторный прогон считает подтверждения падения', async () => {
    // Одно подтверждение за шесть суток означало бы, что прогон не
    // доходил, а не что падение наблюдали. Отличить одно от другого
    // можно только счётом.
    await service.reconcile([downState()]);
    await service.reconcile([downState()]);
    await service.reconcile([downState()]);

    const [incident] = await testDb.rowsOf(addressIncidents);

    expect(incident?.checks).toBe(3);
    expect(incident?.lastDownAt).toBeInstanceOf(Date);
  });

  it('последняя причина обновляется, первая остаётся', async () => {
    // Падение длится часами, и причина за это время меняется: «HTTP 404»
    // на открытии и «DNS не отвечает» в конце — разные поломки. Одна
    // колонка замораживала первую и выдавала её за причину всего падения.
    await service.reconcile([{ ...downState(), healthError: 'HTTP 404' }]);
    await service.reconcile([{ ...downState(), healthError: 'DNS не отвечает (EAI_AGAIN)' }]);

    const [incident] = await testDb.rowsOf(addressIncidents);

    expect(incident?.cause).toBe('HTTP 404');
    expect(incident?.lastCause).toBe('DNS не отвечает (EAI_AGAIN)');
  });

  it('открытый инцидент сразу знает свою последнюю проверку', async () => {
    // Иначе первый же прогон давал бы инцидент с пустым «последний раз не
    // отвечал», и граница возвращения считалась бы от начала падения.
    await service.reconcile([downState()]);

    const [incident] = await testDb.rowsOf(addressIncidents);

    expect(incident?.checks).toBe(1);
    expect(incident?.lastCause).toBe('HTTP 500');
    expect(incident?.lastDownAt).toBeInstanceOf(Date);
  });

  it('приостановленный проект дописывает ход уже открытого падения', async () => {
    // Пауза гасит открытие, но не запись наблюдения: инцидент уже есть, и
    // пуш от этой записи не уходит.
    await service.reconcile([downState()]);
    const events = await service.reconcile([{ ...downState(), isPaused: true }]);

    const [incident] = await testDb.rowsOf(addressIncidents);

    expect(events).toEqual([]);
    expect(incident?.checks).toBe(2);
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

  it('архивный проект событий не даёт', async () => {
    expect(await service.reconcile([{ ...downState(), isArchived: true }])).toEqual([]);
  });

  it('два одновременных прогона дают один инцидент и одно событие', async () => {
    // Оба читают открытые инциденты как пустые, и второй упирается в
    // частичный уникум «один открытый инцидент на адрес». Это гонка, а не
    // сбой: событие отдаёт тот прогон, который успел, и второго пуша по
    // тому же падению быть не должно.
    const [first, second] = await Promise.all([
      service.reconcile([downState()]),
      service.reconcile([downState()]),
    ]);

    expect([...first, ...second]).toHaveLength(1);
    expect(await testDb.rowsOf(addressIncidents)).toHaveLength(1);
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

describe('отказ записи инцидента', () => {
  const DOMAIN_ID = '11111111-1111-4111-8111-111111111111';

  /** Упавший адрес: подделкам хранилища больше ничего не нужно. */
  const state = (): AddressState => ({
    domainId: DOMAIN_ID,
    name: 'project.ru',
    projectId: '22222222-2222-4222-8222-222222222222',
    projectName: 'CAIRN',
    environmentName: 'прод',
    isPaused: false,
    isArchived: false,
    health: HealthState.Down,
    healthError: 'HTTP 500',
  });

  /** Хранилище-подделка: открытие отказывает, остальное задаёт тест. */
  function serviceWith(openByDomain: ReturnType<typeof vi.fn>): {
    service: IncidentsService;
    open: ReturnType<typeof vi.fn>;
  } {
    const open = vi
      .fn()
      .mockRejectedValue(
        new Error(
          'duplicate key value violates unique constraint "address_incidents_one_open_per_domain"',
        ),
      );

    return {
      open,
      service: new IncidentsService({
        open,
        openByDomain,
        resolve: vi.fn(),
      } as unknown as IncidentsRepository),
    };
  }

  it('конфликт уникума перечитывает открытый инцидент, а не глохнет в логе', async () => {
    // Защита от повтора лежит в базе: частичный уникум «один открытый на
    // адрес». Его нарушение означает, что инцидент уже открыл другой
    // прогон — он же и разослал уведомление. Молчание в лог делало это
    // состояние неотличимым от настоящего сбоя записи.
    const openByDomain = vi
      .fn()
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(
        new Map([
          [
            DOMAIN_ID,
            { domainId: DOMAIN_ID, startedAt: new Date(), resolvedAt: null, cause: 'HTTP 500' },
          ],
        ]),
      );
    const { service } = serviceWith(openByDomain);

    const events = await service.reconcile([state()]);

    expect(openByDomain).toHaveBeenCalledTimes(2);
    // Второго события по тому же падению быть не должно: пуш уже ушёл.
    expect(events).toEqual([]);
  });

  it('настоящий отказ записи события не выдумывает', async () => {
    // Открытого инцидента нет и после перечитывания — значит, запись
    // правда не состоялась, и объявлять падение нечем.
    const openByDomain = vi.fn().mockResolvedValue(new Map());
    const { service } = serviceWith(openByDomain);

    expect(await service.reconcile([state()])).toEqual([]);
  });
});
