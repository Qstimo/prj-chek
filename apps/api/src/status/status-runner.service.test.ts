import { EnvironmentKind, HealthState, ProjectLifecycle, SubjectKind } from '@cairn/shared';
import { ConflictException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import {
  addressIncidents,
  auditLog,
  domainStatuses,
  domains,
  environmentDomains,
  environments,
  projects,
  servers as serversTable,
  subjects,
  users,
} from '../db/schema';
import { ServersRepository } from '../servers/servers.repository';
import { IncidentsRepository } from '../incidents/incidents.repository';
import { IncidentEventKind, IncidentsService } from '../incidents/incidents.service';
import type { IncidentNotifier } from './notifier';
import { StatusRepository } from './status.repository';
import { type Checkers, StatusRunOutcome, StatusRunnerService } from './status-runner.service';
import { StatusService } from './status.service';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('runner статусов', () => {
  let testDb: TestDatabase;
  let repository: StatusRepository;
  let servers: ServersRepository;
  let incidents: IncidentsService;
  let projectId: string;
  let subjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new StatusRepository(testDb.db, new AccessService(testDb.db));
    // Субъекта реестр серверов не принимает — так решено этапом 9.
    servers = new ServersRepository(testDb.db);
    incidents = new IncidentsService(new IncidentsRepository(testDb.db, new AccessService(testDb.db)));

    // Пауза переспроса по умолчанию — полминуты: без обнуления каждый
    // тест прогона ждал бы её вживую.
    process.env.CAIRN_HEALTH_RECHECK_DELAY_SECONDS = '0';
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

  /**
   * Один адрес вместо двух: тесты переспроса считают вызовы health, и
   * второй адрес сделал бы числа нечитаемыми.
   */
  async function seedOneTarget(): Promise<void> {
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
    await testDb.db
      .insert(environmentDomains)
      .values({ environmentId: environment!.id, domainId: root!.id, name: 'example.com' });
  }

  /** Проверщики, отвечающие без отказов. */
  function healthyCheckers() {
    return {
      checkHealth: vi.fn().mockResolvedValue({
        health: HealthState.Up,
        latencyMs: 42,
        code: null,
        error: null,
        redirectTo: null,
      }),
      checkTls: vi.fn().mockResolvedValue({
        validTo: new Date('2027-01-01T00:00:00Z'),
        trusted: true,
        code: null,
        error: null,
      }),
      checkDomainExpiry: vi
        .fn()
        .mockResolvedValue({ expiresAt: new Date('2027-06-01T00:00:00Z'), code: null, error: null }),
      resolveAddress: vi
        .fn()
        .mockResolvedValue({ ips: ['203.0.113.10'], code: null, error: null }),
    };
  }

  /** Упавший health с заданной причиной: нужен почти каждому тесту об инцидентах. */
  function downHealth(error: string | null = 'HTTP 500') {
    return vi
      .fn()
      .mockResolvedValue({ health: HealthState.Down, latencyMs: 0, code: null, error, redirectTo: null });
  }

  /**
   * Прогон с заданными проверщиками и, при надобности, уведомителем.
   *
   * Проверщики накладываются на здоровый набор: тесту почти всегда нужен
   * один подменённый, а не все четыре.
   *
   * Соединение замка — своё (`appDb`): замок держит его на весь прогон, а
   * рабочий пул фикстуры состоит из одного соединения, и занять его
   * значило бы запереть сам прогон.
   */
  function runnerWith(
    overrides: Partial<Checkers> = {},
    notifier: IncidentNotifier | null = null,
  ): StatusRunnerService {
    return new StatusRunnerService(
      testDb.appDb,
      repository,
      servers,
      { ...healthyCheckers(), ...overrides },
      incidents,
      notifier,
    );
  }

  it('по каждому адресу делает все три проверки', async () => {
    await seedTargets();

    const checkers = healthyCheckers();
    const runner = runnerWith(checkers);

    await runner.runAll();

    expect(checkers.checkHealth).toHaveBeenCalledWith('stage.example.com', '/api/health');
    expect(checkers.checkTls).toHaveBeenCalledWith('stage.example.com');
  });

  it('у реестра спрашивает корень, и один раз на прогон', async () => {
    // Реестры знают только корни: пока вопрос задавался по имени адреса,
    // у каждого поддомена висело вечное «реестр ответил HTTP 404». Два
    // адреса одного корня — одна оплата и один вопрос.
    await seedTargets();

    const checkers = healthyCheckers();

    await runnerWith(checkers).runAll();

    expect(checkers.checkDomainExpiry).toHaveBeenCalledTimes(1);
    expect(checkers.checkDomainExpiry).toHaveBeenCalledWith('example.com');
  });

  it('прогон пишет три проверки одной строкой на адрес', async () => {
    await seedTargets();

    const runner = runnerWith(healthyCheckers());

    await runner.runAll();

    const rows = await testDb.db.select().from(domainStatuses);
    const [status] = rows;

    expect(rows).toHaveLength(2);
    expect(status).toMatchObject({ health: HealthState.Up, latencyMs: 42 });
    expect(status?.tlsValidTo?.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(status?.registryExpiresAt?.toISOString()).toBe('2027-06-01T00:00:00.000Z');
    expect(status?.tlsTrusted).toBe(true);
  });

  it('окружение без пути проверяется по корню', async () => {
    await seedTargets();
    await testDb.db.update(environments).set({ healthCheckPath: null });

    const checkers = healthyCheckers();

    await runnerWith(checkers).runAll();

    expect(checkers.checkHealth).toHaveBeenCalledWith('example.com', null);
  });

  it('разрешает адрес наравне с остальными проверками', async () => {
    await seedTargets();

    const checkers = healthyCheckers();

    await runnerWith(checkers).runAll();

    expect(checkers.resolveAddress).toHaveBeenCalledWith('stage.example.com');

    const [status] = await testDb.db
      .select()
      .from(domainStatuses)
      .orderBy(domainStatuses.resolvedIp);

    expect(status?.resolvedIp).toBe('203.0.113.10');
    expect(status?.resolvedIps).toEqual(['203.0.113.10']);
  });

  it('заводит машину и привязывает окружение', async () => {
    // Человек вписал адрес — большего от него не требуется.
    await seedTargets();

    await runnerWith(healthyCheckers()).runAll();

    const [machine] = await testDb.db.select().from(serversTable);
    const [environment] = await testDb.db.select().from(environments);

    expect(machine).toMatchObject({ name: '203.0.113.10', ip: '203.0.113.10' });
    expect(environment?.serverId).toBe(machine?.id);
  });

  it('повторный прогон не плодит вторую машину', async () => {
    await seedTargets();

    await runnerWith(healthyCheckers()).runAll();
    await runnerWith(healthyCheckers()).runAll();

    expect(await testDb.db.select().from(serversTable)).toHaveLength(1);
  });

  it('машина, названная человеком адресом, не ломает привязку', async () => {
    // Имя в реестре уникально: голая вставка нарушала ключ, ошибка
    // гасилась в лог, и окружение не привязывалось никогда.
    await seedTargets();
    await testDb.db.insert(serversTable).values({ name: '203.0.113.10' });

    await runnerWith(healthyCheckers()).runAll();

    const machines = await testDb.db.select().from(serversTable);
    const [environment] = await testDb.db.select().from(environments);

    expect(machines).toHaveLength(1);
    expect(environment?.serverId).toBe(machines[0]!.id);
  });

  it('падение одного адреса не прерывает обход', async () => {
    await seedTargets();

    const checkers = healthyCheckers();
    // Проверщики не бросают по контракту, но runner обязан пережить
    // даже нарушение этого контракта.
    checkers.checkHealth.mockRejectedValueOnce(new Error('взорвалось'));

    await runnerWith(checkers).runAll();

    const rows = await testDb.db.select().from(domainStatuses);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ health: HealthState.Up });
  });

  it('незаписанный отказ инцидента не открывает', async () => {
    // Порядок «сначала база, потом память»: исключение записи раньше
    // правило читало из памяти уже обновлённый вердикт и открывало
    // инцидент по падению, которого на экране никто не увидит.
    await seedOneTarget();

    const broken = new StatusRepository(testDb.db, new AccessService(testDb.db));
    vi.spyOn(broken, 'upsertAddressStatus').mockRejectedValue(new Error('база отказала'));

    const runner = new StatusRunnerService(
      testDb.appDb,
      broken,
      servers,
      { ...healthyCheckers(), checkHealth: downHealth() },
      incidents,
      null,
    );

    await runner.runAll();

    expect(await testDb.rowsOf(addressIncidents)).toHaveLength(0);
  });

  it('ручной запуск пишет в журнал, фоновый — нет', async () => {
    const runner = runnerWith();
    const service = new StatusService(testDb.db, repository, runner, new AuditService());

    await runner.runAll();
    expect(
      await testDb.db.select().from(auditLog).where(eq(auditLog.action, AuditAction.StatusCheckRun)),
    ).toHaveLength(0);

    await service.runNow(admin());
    await runner.settled();

    expect(
      await testDb.db.select().from(auditLog).where(eq(auditLog.action, AuditAction.StatusCheckRun)),
    ).toHaveLength(1);
  });

  it('ручной запуск отвечает, не дожидаясь обхода', async () => {
    // Ручка объявлена 202: держать запрос браузера до конца обхода
    // значило рвать его по таймауту при живом прогоне.
    await seedOneTarget();

    let release = (): void => {};
    const checkHealth = vi.fn().mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });

      return { health: HealthState.Up, latencyMs: 1, code: null, error: null, redirectTo: null };
    });
    const runner = runnerWith({ checkHealth });
    const service = new StatusService(testDb.db, repository, runner, new AuditService());

    await service.runNow(admin());
    await vi.waitFor(() => expect(checkHealth).toHaveBeenCalled());

    // Ответ уже отдан, а обход ещё держится на первой проверке: писать
    // ему пока нечего.
    expect(await testDb.db.select().from(domainStatuses)).toHaveLength(0);

    release();
    await runner.settled();

    expect(await testDb.db.select().from(domainStatuses)).toHaveLength(1);
  });

  it('ручной запуск поверх идущего отвечает отказом', async () => {
    // Различимо, а не молча: 202 поверх идущего прогона обещал бы
    // обновление, которого этот запрос не вызовет.
    await seedOneTarget();

    let release = (): void => {};
    const checkHealth = vi.fn().mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });

      return { health: HealthState.Up, latencyMs: 1, code: null, error: null, redirectTo: null };
    });
    const runner = runnerWith({ checkHealth });
    const service = new StatusService(testDb.db, repository, runner, new AuditService());

    await service.runNow(admin());
    await vi.waitFor(() => expect(checkHealth).toHaveBeenCalled());

    await expect(service.runNow(admin())).rejects.toBeInstanceOf(ConflictException);

    release();
    await runner.settled();
  });

  it('второй запуск поверх идущего не начинается', async () => {
    // Два прогона читают открытые инциденты как пустые, и второй либо
    // ловит нарушение уникума, либо закрывает только что открытый
    // инцидент ложным «отвечает снова».
    await seedOneTarget();

    let release = (): void => {};
    const checkHealth = vi.fn().mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });

      return { health: HealthState.Up, latencyMs: 1, code: null, error: null, redirectTo: null };
    });
    const runner = runnerWith({ checkHealth });
    const first = runner.runAll();

    expect(await runner.runAll()).toBe(StatusRunOutcome.Busy);

    // Отпускать первый прогон можно только после того, как он дошёл до
    // проверки: иначе `release` ещё не присвоен, и ждать его некому.
    await vi.waitFor(() => expect(checkHealth).toHaveBeenCalled());
    release();
    expect(await first).toBe(StatusRunOutcome.Done);
    expect(checkHealth).toHaveBeenCalledTimes(1);
  });

  it('прогон другого экземпляра API тоже не наезжает', async () => {
    // Замок в памяти процесса не защитил бы от второго контейнера:
    // он лежит в базе — `pg_try_advisory_lock`.
    await seedOneTarget();

    let release = (): void => {};
    const busy = vi.fn().mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });

      return { health: HealthState.Up, latencyMs: 1, code: null, error: null, redirectTo: null };
    });
    const first = runnerWith({ checkHealth: busy });
    // Своё соединение — другой экземпляр API: в памяти процесса про
    // чужой прогон не знает никто.
    const second = new StatusRunnerService(
      testDb.db,
      repository,
      servers,
      healthyCheckers(),
      incidents,
      null,
    );

    const running = first.runAll();
    // Пока первый не взял замок, спрашивать второго бессмысленно: оба
    // соревновались бы за него в произвольном порядке.
    await vi.waitFor(() => expect(busy).toHaveBeenCalled());

    expect(await second.runAll()).toBe(StatusRunOutcome.Busy);
    const service = new StatusService(testDb.db, repository, second, new AuditService());
    try {
      await expect(service.runNow(admin())).rejects.toBeInstanceOf(ConflictException);
      expect(await testDb.db.select().from(auditLog)
        .where(eq(auditLog.action, AuditAction.StatusCheckRun))).toHaveLength(0);
    } finally {
      release();
      await running;
    }
  });

  it('прогон при старте идёт сразу, не ожидая интервала', async () => {
    // После деплоя статус устаревал на целый интервал, а новый адрес до
    // того же срока оставался «неизвестно».
    await seedOneTarget();
    process.env.CAIRN_STATUS_CHECK_INTERVAL_MINUTES = '15';

    const runner = runnerWith(healthyCheckers());

    try {
      runner.onModuleInit();
      await runner.settled();
    } finally {
      process.env.CAIRN_STATUS_CHECK_INTERVAL_MINUTES = '0';
      runner.onModuleDestroy();
    }

    expect(await testDb.db.select().from(domainStatuses)).toHaveLength(1);
  });

  it('выключенный цикл не прогоняет и при старте', async () => {
    // `0` означает «выключено целиком» — так работают тесты и локальная
    // разработка, и внезапный обход сети при подъёме приложения им не нужен.
    await seedOneTarget();
    process.env.CAIRN_STATUS_CHECK_INTERVAL_MINUTES = '0';

    const runner = runnerWith(healthyCheckers());

    runner.onModuleInit();
    await runner.settled();
    runner.onModuleDestroy();

    expect(await testDb.db.select().from(domainStatuses)).toHaveLength(0);
  });

  it('одиночный отказ переспрашивается и инцидента не даёт', async () => {
    // Сетевая икота не должна будить человека: спрашиваем ещё раз.
    await seedOneTarget();

    const checkHealth = vi
      .fn()
      .mockResolvedValueOnce({
        health: HealthState.Down,
        latencyMs: 0,
        code: null,
        error: 'таймаут',
        redirectTo: null,
      })
      .mockResolvedValueOnce({
        health: HealthState.Up,
        latencyMs: 12,
        code: null,
        error: null,
        redirectTo: null,
      });

    await runnerWith({ checkHealth }).runAll();

    expect(checkHealth).toHaveBeenCalledTimes(2);
    expect(await testDb.rowsOf(addressIncidents)).toHaveLength(0);
  });

  it('подтверждённый отказ открывает инцидент', async () => {
    await seedOneTarget();

    await runnerWith({ checkHealth: downHealth() }).runAll();

    const [incident] = await testDb.rowsOf(addressIncidents);

    expect(incident?.cause).toBe('HTTP 500');
  });

  it('переспрос не затирает сроки первой фазы', async () => {
    await seedOneTarget();

    await runnerWith({ checkHealth: downHealth('таймаут') }).runAll();

    const [status] = await testDb.db.select().from(domainStatuses);

    expect(status?.health).toBe(HealthState.Down);
    expect(status?.tlsValidTo).not.toBeNull();
  });

  it('живой адрес не переспрашивается', async () => {
    await seedOneTarget();

    const checkers = healthyCheckers();

    await runnerWith(checkers).runAll();

    expect(checkers.checkHealth).toHaveBeenCalledTimes(1);
  });

  it('события уходят уведомителю', async () => {
    await seedOneTarget();

    const notify = vi.fn();

    await runnerWith({ checkHealth: downHealth(null) }, { notify }).runAll();

    expect(notify).toHaveBeenCalledWith([
      expect.objectContaining({ kind: IncidentEventKind.Opened, address: 'example.com' }),
    ]);
  });

  it('ручной запуск переспрашивает, но паузы не берёт', async () => {
    // Человек смотрит на кнопку «Проверить сейчас»: пауза в полминуты
    // держала бы запрос браузера без всякой обратной связи.
    await seedOneTarget();
    process.env.CAIRN_HEALTH_RECHECK_DELAY_SECONDS = '600';

    const checkHealth = downHealth();

    try {
      await runnerWith({ checkHealth }).runAll({ isManual: true });
    } finally {
      process.env.CAIRN_HEALTH_RECHECK_DELAY_SECONDS = '0';
    }

    expect(checkHealth).toHaveBeenCalledTimes(2);
  });

  it('отказ рассылки не валит прогон', async () => {
    // Статус важнее уведомления: инцидент обязан остаться записанным.
    await seedOneTarget();

    await runnerWith(
      { checkHealth: downHealth() },
      { notify: vi.fn().mockRejectedValue(new Error('push-служба молчит')) },
    ).runAll();

    expect(await testDb.rowsOf(addressIncidents)).toHaveLength(1);
  });

  it('приостановленный проект инцидента не открывает', async () => {
    // ТЗ 6: намеренно отключённый проект не выглядит аварийным.
    await seedOneTarget();
    await testDb.db
      .update(projects)
      .set({ lifecycle: ProjectLifecycle.Paused })
      .where(eq(projects.id, projectId));

    await runnerWith({ checkHealth: downHealth() }).runAll();

    expect(await testDb.rowsOf(addressIncidents)).toHaveLength(0);
  });

  it('архивный проект не проверяется и инцидента не открывает', async () => {
    // Архивный проект со снятым доменом открывал инцидент и будил
    // человека пушем: чинить его никто не собирается.
    await seedOneTarget();
    await testDb.db
      .update(projects)
      .set({ lifecycle: ProjectLifecycle.Archived })
      .where(eq(projects.id, projectId));

    const checkHealth = downHealth();

    await runnerWith({ checkHealth }).runAll();

    expect(checkHealth).not.toHaveBeenCalled();
    expect(await testDb.rowsOf(addressIncidents)).toHaveLength(0);
  });
});
