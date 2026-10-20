import { EnvironmentKind, HealthState, ProjectLifecycle, SubjectKind } from '@cairn/shared';
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
import { type Checkers, StatusRunnerService } from './status-runner.service';
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
      checkHealth: vi
        .fn()
        .mockResolvedValue({ health: HealthState.Up, latencyMs: 42, error: null }),
      checkTls: vi
        .fn()
        .mockResolvedValue({ validTo: new Date('2027-01-01T00:00:00Z'), error: null }),
      checkDomainExpiry: vi
        .fn()
        .mockResolvedValue({ expiresAt: new Date('2027-06-01T00:00:00Z'), error: null }),
      resolveAddress: vi.fn().mockResolvedValue({ ip: '203.0.113.10', error: null }),
    };
  }

  /**
   * Прогон с заданными проверщиками и, при надобности, уведомителем.
   *
   * Проверщики накладываются на здоровый набор: тесту почти всегда нужен
   * один подменённый, а не все четыре.
   */
  function runnerWith(
    overrides: Partial<Checkers> = {},
    notifier: IncidentNotifier | null = null,
  ): StatusRunnerService {
    return new StatusRunnerService(
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
    expect(checkers.checkDomainExpiry).toHaveBeenCalledWith('stage.example.com');
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

  it('ручной запуск пишет в журнал, фоновый — нет', async () => {
    const runner = runnerWith({
      checkHealth: vi.fn(),
      checkTls: vi.fn(),
      checkDomainExpiry: vi.fn(),
      resolveAddress: vi.fn(),
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
  it('одиночный отказ переспрашивается и инцидента не даёт', async () => {
    // Сетевая икота не должна будить человека: спрашиваем ещё раз.
    await seedOneTarget();

    const checkHealth = vi
      .fn()
      .mockResolvedValueOnce({ health: HealthState.Down, latencyMs: 0, error: 'таймаут' })
      .mockResolvedValueOnce({ health: HealthState.Up, latencyMs: 12, error: null });

    await runnerWith({ checkHealth }).runAll();

    expect(checkHealth).toHaveBeenCalledTimes(2);
    expect(await testDb.rowsOf(addressIncidents)).toHaveLength(0);
  });

  it('подтверждённый отказ открывает инцидент', async () => {
    await seedOneTarget();

    const checkHealth = vi
      .fn()
      .mockResolvedValue({ health: HealthState.Down, latencyMs: 0, error: 'HTTP 500' });

    await runnerWith({ checkHealth }).runAll();

    const [incident] = await testDb.rowsOf(addressIncidents);

    expect(incident?.cause).toBe('HTTP 500');
  });

  it('переспрос не затирает сроки первой фазы', async () => {
    await seedOneTarget();

    await runnerWith({
      checkHealth: vi
        .fn()
        .mockResolvedValue({ health: HealthState.Down, latencyMs: 0, error: 'таймаут' }),
    }).runAll();

    const [status] = await testDb.db.select().from(domainStatuses);

    expect(status?.health).toBe(HealthState.Down);
    expect(status?.tlsValidTo).not.toBeNull();
  });

  it('живой адрес не переспрашивается', async () => {
    await seedOneTarget();

    const checkHealth = vi
      .fn()
      .mockResolvedValue({ health: HealthState.Up, latencyMs: 10, error: null });

    await runnerWith({ checkHealth }).runAll();

    expect(checkHealth).toHaveBeenCalledTimes(1);
  });

  it('события уходят уведомителю', async () => {
    await seedOneTarget();

    const notify = vi.fn();

    await runnerWith(
      {
        checkHealth: vi
          .fn()
          .mockResolvedValue({ health: HealthState.Down, latencyMs: 0, error: null }),
      },
      { notify },
    ).runAll();

    expect(notify).toHaveBeenCalledWith([
      expect.objectContaining({ kind: IncidentEventKind.Opened, address: 'example.com' }),
    ]);
  });

  it('отказ рассылки не валит прогон', async () => {
    // Статус важнее уведомления: инцидент обязан остаться записанным.
    await seedOneTarget();

    await runnerWith(
      {
        checkHealth: vi
          .fn()
          .mockResolvedValue({ health: HealthState.Down, latencyMs: 0, error: 'HTTP 500' }),
      },
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

    await runnerWith({
      checkHealth: vi
        .fn()
        .mockResolvedValue({ health: HealthState.Down, latencyMs: 0, error: 'HTTP 500' }),
    }).runAll();

    expect(await testDb.rowsOf(addressIncidents)).toHaveLength(0);
  });
});
