import {
  AccessLevel,
  EnvironmentKind,
  HealthState,
  Section,
  StatusIndicator,
  StatusWarningKind,
  SubjectKind,
} from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import { SectionNotVisibleError } from '../access/access.errors';
import type { RequestSubject } from '../access/access.types';
import {
  domainStatuses,
  domains,
  environmentDomains,
  environments,
  grants,
  projects,
  servers,
  subjects,
  users,
} from '../db/schema';
import { StatusRepository, type AddressStatusInput } from './status.repository';
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
        healthCheckPath: '/api/health',
      })
      .returning();
    environmentId = environment!.id;

    const [root] = await testDb.db.insert(domains).values({ name: 'example.com' }).returning();
    const [domain] = await testDb.db
      .insert(environmentDomains)
      .values({ environmentId, domainId: root!.id, name: 'example.com' })
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

  /** Результат всех трёх проверок адреса: в тестах меняется точечно. */
  function checked(overrides: Partial<AddressStatusInput> = {}): AddressStatusInput {
    return {
      health: HealthState.Up,
      latencyMs: 42,
      healthError: null,
      resolvedIp: null,
      resolveError: null,
      tlsValidTo: null,
      tlsError: null,
      registryExpiresAt: null,
      registryError: null,
      ...overrides,
    };
  }

  it('повторная запись статуса обновляет строку, а не плодит', async () => {
    await repository.upsertAddressStatus(
      domainId,
      checked({ health: HealthState.Down, latencyMs: null, healthError: 'HTTP 500' }),
    );
    await repository.upsertAddressStatus(domainId, checked());

    const rows = await testDb.db.select().from(domainStatuses);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ health: HealthState.Up, latencyMs: 42, healthError: null });
  });

  it('целями обхода служат адреса окружений', async () => {
    // Отдельного адреса проверки больше нет: проверяется то же имя,
    // о котором отчитываются сертификат и регистратор.
    const targets = await repository.listTargets();

    expect(targets.addresses).toEqual([
      { id: domainId, name: 'example.com', healthCheckPath: '/api/health' },
    ]);
  });

  it('пишет три проверки одной строкой', async () => {
    await repository.upsertAddressStatus(
      domainId,
      checked({ tlsValidTo: new Date('2027-01-01T00:00:00.000Z') }),
    );
    await grantInfra(AccessLevel.Metadata);

    const status = await repository.statusForProject(member(), projectId);

    expect(status.domains[0]).toMatchObject({
      name: 'example.com',
      environmentId,
      health: HealthState.Up,
      latencyMs: 42,
      tlsValidTo: '2027-01-01T00:00:00.000Z',
    });
  });

  it('окружение живо, когда живы его адреса', async () => {
    await repository.upsertAddressStatus(domainId, checked());
    await grantInfra(AccessLevel.Metadata);

    const status = await repository.statusForProject(member(), projectId);

    expect(status.indicator).toBe(StatusIndicator.Ok);
    expect(status.environments[0]).toMatchObject({ name: 'Прод', health: HealthState.Up });
  });

  it('мёртвый адрес роняет окружение и называет себя', async () => {
    await repository.upsertAddressStatus(
      domainId,
      checked({ health: HealthState.Down, latencyMs: null, healthError: 'HTTP 502' }),
    );
    await grantInfra(AccessLevel.Metadata);

    const status = await repository.statusForProject(member(), projectId);

    expect(status.indicator).toBe(StatusIndicator.Down);
    expect(status.environments[0]?.health).toBe(HealthState.Down);
    expect(status.warnings).toContainEqual(
      expect.objectContaining({
        kind: StatusWarningKind.HealthDown,
        subject: 'example.com',
        detail: 'HTTP 502',
      }),
    );
  });

  it('пишет и отдаёт результат разрешения', async () => {
    await repository.upsertAddressStatus(domainId, checked({ resolvedIp: '203.0.113.10' }));
    await grantInfra(AccessLevel.Metadata);

    const status = await repository.statusForProject(member(), projectId);

    expect(status.domains[0]).toMatchObject({ resolvedIp: '203.0.113.10', resolveError: null });
  });

  it('перечисляет окружения с их адресами для второго прохода', async () => {
    // Решение о машине принимается по окружению целиком: привязка у него
    // одна, а адресов несколько.
    await repository.upsertAddressStatus(domainId, checked({ resolvedIp: '203.0.113.10' }));

    const targets = await repository.listDiscoveryTargets();

    expect(targets).toEqual([
      {
        environmentId,
        environmentName: 'Прод',
        serverId: null,
        addresses: [{ name: 'example.com', resolvedIp: '203.0.113.10' }],
      },
    ]);
  });

  it('окружение без адресов не проверяется', async () => {
    // Проверять нечем — значит, нечего и утверждать.
    await testDb.db.delete(environmentDomains).where(eq(environmentDomains.id, domainId));
    await grantInfra(AccessLevel.Metadata);

    const status = await repository.statusForProject(member(), projectId);

    expect(status.environments[0]?.health).toBeNull();
    expect(status.indicator).toBe(StatusIndicator.Unknown);
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

  describe('срок оплаты сервера в статусе проекта', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;

    /** Календарный день через `days` суток от сегодня в формате контракта. */
    function inDays(days: number): string {
      return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
    }

    /** Ставит окружение проекта на новый сервер с заданным сроком оплаты. */
    async function placeOnServer(name: string, paidUntil: string | null): Promise<void> {
      const [server] = await testDb.db.insert(servers).values({ name, paidUntil }).returning();

      await testDb.db
        .update(environments)
        .set({ serverId: server!.id })
        .where(eq(environments.id, environmentId));
    }

    it('предупреждает о близком сроке и поднимает индикатор', async () => {
      await placeOnServer('hetzner-fsn-1', inDays(3));
      await grantInfra(AccessLevel.Metadata);

      const status = await repository.statusForProject(member(), projectId);

      expect(status.warnings).toContainEqual(
        expect.objectContaining({
          kind: StatusWarningKind.ServerExpiring,
          subject: 'hetzner-fsn-1',
        }),
      );
      expect(status.indicator).toBe(StatusIndicator.Warning);
    });

    it('не раскрывает соседей по машине', async () => {
      // В предупреждении только имя машины: список её проектов не должен
      // просачиваться в статус чужого проекта.
      await placeOnServer('hetzner-fsn-1', inDays(3));
      await grantInfra(AccessLevel.Metadata);

      const status = await repository.statusForProject(member(), projectId);
      const serverWarning = status.warnings.find(
        (warning) => warning.kind === StatusWarningKind.ServerExpiring,
      );

      expect(Object.keys(serverWarning ?? {})).toEqual(['kind', 'subject', 'detail']);
    });

    it('молчит, когда срок далёк или сервера нет', async () => {
      await placeOnServer('hetzner-fsn-1', inDays(60));
      await grantInfra(AccessLevel.Metadata);

      const withFarDate = await repository.statusForProject(member(), projectId);

      expect(
        withFarDate.warnings.some(
          (warning) => warning.kind === StatusWarningKind.ServerExpiring,
        ),
      ).toBe(false);
    });

    it('даёт одно предупреждение на машину, а не на каждое её окружение', async () => {
      await placeOnServer('hetzner-fsn-1', inDays(3));

      const [server] = await testDb.db.select().from(servers);
      await testDb.db.insert(environments).values({
        projectId,
        name: 'Стейдж',
        kind: EnvironmentKind.Staging,
        serverId: server!.id,
      });
      await grantInfra(AccessLevel.Metadata);

      const status = await repository.statusForProject(member(), projectId);

      expect(
        status.warnings.filter((warning) => warning.kind === StatusWarningKind.ServerExpiring),
      ).toHaveLength(1);
    });
  });

  describe('срок продления домена в статусе проекта', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;

    /** Календарный день через `days` суток от сегодня в формате контракта. */
    function inDays(days: number): string {
      return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
    }

    it('предупреждает о близком продлении и поднимает индикатор', async () => {
      await testDb.db.update(domains).set({ paidUntil: inDays(5) });
      await grantInfra(AccessLevel.Metadata);

      const status = await repository.statusForProject(member(), projectId);

      expect(status.warnings).toContainEqual(
        expect.objectContaining({
          kind: StatusWarningKind.DomainRenewalExpiring,
          subject: 'example.com',
        }),
      );
      expect(status.indicator).toBe(StatusIndicator.Warning);
    });

    it('даёт одно предупреждение на корень, а не на каждый поддомен', async () => {
      const [root] = await testDb.db.select().from(domains);
      await testDb.db.update(domains).set({ paidUntil: inDays(5) });
      await testDb.db
        .insert(environmentDomains)
        .values({ environmentId, domainId: root!.id, name: 'stage.example.com' });
      await grantInfra(AccessLevel.Metadata);

      const status = await repository.statusForProject(member(), projectId);

      expect(
        status.warnings.filter(
          (warning) => warning.kind === StatusWarningKind.DomainRenewalExpiring,
        ),
      ).toHaveLength(1);
    });

    it('молчит, когда срок далёк', async () => {
      await testDb.db.update(domains).set({ paidUntil: inDays(90) });
      await grantInfra(AccessLevel.Metadata);

      const status = await repository.statusForProject(member(), projectId);

      expect(
        status.warnings.some(
          (warning) => warning.kind === StatusWarningKind.DomainRenewalExpiring,
        ),
      ).toBe(false);
    });
  });
});
