import {
  AccessLevel,
  EnvironmentKind,
  HealthState,
  ProjectLifecycle,
  Section,
  StatusCheckCode,
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
  let adminSubjectId: string;
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
    adminSubjectId = adminSubject!.id;

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

  /** Суперадмин: единственный, кому видны предупреждения реестров. */
  const superadmin = (): RequestSubject => ({
    id: adminSubjectId,
    kind: SubjectKind.User,
    label: 'admin@cairn.local',
    isSuperadmin: true,
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
      healthCode: null,
      redirectTo: null,
      resolvedIps: [],
      resolveError: null,
      tlsValidTo: null,
      tlsTrusted: null,
      tlsCode: null,
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
      {
        id: domainId,
        name: 'example.com',
        rootDomain: 'example.com',
        healthCheckPath: '/api/health',
        projectId,
        projectName: 'Проект',
        environmentName: 'Прод',
        lifecycle: ProjectLifecycle.Development,
      },
    ]);
  });

  it('цель обхода несёт корень адреса', async () => {
    // Реестры знают только корни: пока у них спрашивали имя поддомена, у
    // каждого адреса висело вечное «реестр ответил HTTP 404». Корень
    // берётся связью, а не разбором имени: список зон с именами третьего
    // уровня у нас закрытый и неполон по устройству.
    await testDb.db
      .insert(environmentDomains)
      .values({
        environmentId,
        domainId: (await testDb.db.select().from(domains))[0]!.id,
        name: 'stage.example.com',
      });

    const { addresses } = await repository.listTargets();
    const stage = addresses.find((address) => address.name === 'stage.example.com');

    expect(stage?.rootDomain).toBe('example.com');
  });

  it('цель обхода несёт проект, окружение и жизненный цикл', async () => {
    // Сведение инцидентов решает по проекту (пауза) и пишет в уведомление
    // имена проекта и окружения: второй запрос за ними был бы лишним.
    const { addresses } = await repository.listTargets();

    expect(addresses[0]).toMatchObject({
      projectId,
      projectName: 'Проект',
      environmentName: 'Прод',
      lifecycle: ProjectLifecycle.Development,
    });
  });

  it('переспрос правит только здоровье, не затирая сроки', async () => {
    // Переспрашивается один health: TLS и срок регистрации за полминуты
    // не меняются, а перезапись их пустыми затёрла бы первую фазу.
    await repository.upsertAddressStatus(
      domainId,
      checked({ tlsValidTo: new Date('2027-01-01T00:00:00.000Z') }),
    );

    await repository.updateAddressHealth(domainId, {
      health: HealthState.Down,
      latencyMs: null,
      healthError: 'таймаут',
      healthCode: StatusCheckCode.Timeout,
      redirectTo: null,
    });

    const [row] = await testDb.db.select().from(domainStatuses);

    expect(row?.health).toBe(HealthState.Down);
    expect(row?.healthError).toBe('таймаут');
    expect(row?.healthCode).toBe(StatusCheckCode.Timeout);
    expect(row?.tlsValidTo).not.toBeNull();
  });

  it('переспрос сообщает, что строки статуса не было', async () => {
    // Первая фаза могла упасть до записи. Молчаливый `UPDATE` по
    // отсутствующей строке читался как успех, и прогон терял знание о
    // том, что писать было некуда.
    const missing = await repository.updateAddressHealth(domainId, {
      health: HealthState.Down,
      latencyMs: null,
      healthError: 'таймаут',
      healthCode: StatusCheckCode.Timeout,
      redirectTo: null,
    });

    expect(missing).toBe(false);

    await repository.upsertAddressStatus(domainId, checked());

    const written = await repository.updateAddressHealth(domainId, {
      health: HealthState.Up,
      latencyMs: 10,
      healthError: null,
      healthCode: null,
      redirectTo: null,
    });

    expect(written).toBe(true);
  });

  it('хранит код наблюдения и доверие сертификату', async () => {
    // Отсюда росло «не отвечает» рядом с зелёным «TLS до 2027-03-01»:
    // срок был, а правды о доверии не было.
    await repository.upsertAddressStatus(
      domainId,
      checked({
        healthCode: StatusCheckCode.AuthRequired,
        redirectTo: 'https://example.com/login',
        tlsValidTo: new Date('2027-03-01T00:00:00.000Z'),
        tlsTrusted: false,
        tlsCode: StatusCheckCode.CertificateUntrusted,
        tlsError: 'сертификат не вызывает доверия (DEPTH_ZERO_SELF_SIGNED_CERT)',
      }),
    );
    await grantInfra(AccessLevel.Metadata);

    const status = await repository.statusForProject(member(), projectId);

    expect(status.domains[0]).toMatchObject({
      healthCode: StatusCheckCode.AuthRequired,
      redirectTo: 'https://example.com/login',
      tlsTrusted: false,
      tlsCode: StatusCheckCode.CertificateUntrusted,
    });
    expect(status.warnings.map((warning) => warning.kind)).toContain(
      StatusWarningKind.TlsInvalid,
    );
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
    await repository.upsertAddressStatus(domainId, checked({ resolvedIps: ['203.0.113.10'] }));
    await grantInfra(AccessLevel.Metadata);

    const status = await repository.statusForProject(member(), projectId);

    expect(status.domains[0]).toMatchObject({
      resolvedIp: '203.0.113.10',
      resolvedIps: ['203.0.113.10'],
      resolveError: null,
    });
  });

  it('из множества адресов выбирает один и тот же', async () => {
    // Выбор делается здесь, а не в прогоне: привязка у окружения одна, а
    // резолверы ротируют порядок — выбранный адрес не должен плясать.
    await repository.upsertAddressStatus(
      domainId,
      checked({ resolvedIps: ['203.0.113.11', '203.0.113.10'] }),
    );
    await grantInfra(AccessLevel.Metadata);

    const status = await repository.statusForProject(member(), projectId);

    expect(status.domains[0]).toMatchObject({
      resolvedIp: '203.0.113.10',
      resolvedIps: ['203.0.113.11', '203.0.113.10'],
    });
  });

  it('отказ разрешения не затирает прежний адрес', async () => {
    // Потерянный UDP-пакет не повод объявить, что имя никуда не смотрит:
    // привязка окружения и предупреждение о расхождении читают эту
    // колонку, и пустота в ней мигала бы на ровном месте.
    await repository.upsertAddressStatus(
      domainId,
      checked({ resolvedIps: ['203.0.113.10', '203.0.113.11'] }),
    );
    await repository.upsertAddressStatus(
      domainId,
      checked({ resolvedIps: [], resolveError: 'DNS сейчас не отвечает (EAI_AGAIN)' }),
    );
    await grantInfra(AccessLevel.Metadata);

    const status = await repository.statusForProject(member(), projectId);

    expect(status.domains[0]).toMatchObject({
      resolvedIp: '203.0.113.10',
      resolvedIps: ['203.0.113.10', '203.0.113.11'],
      resolveError: 'DNS сейчас не отвечает (EAI_AGAIN)',
    });
  });

  it('первая запись с отказом разрешения оставляет адрес пустым', async () => {
    // Сохранять нечего: прежнего знания не было.
    await repository.upsertAddressStatus(
      domainId,
      checked({ resolvedIps: [], resolveError: 'имени нет в DNS (ENOTFOUND)' }),
    );
    await grantInfra(AccessLevel.Metadata);

    const status = await repository.statusForProject(member(), projectId);

    expect(status.domains[0]).toMatchObject({ resolvedIp: null, resolvedIps: [] });
  });

  it('перечисляет окружения с их адресами для второго прохода', async () => {
    // Решение о машине принимается по окружению целиком: привязка у него
    // одна, а адресов несколько.
    await repository.upsertAddressStatus(domainId, checked({ resolvedIps: ['203.0.113.10'] }));

    const targets = await repository.listDiscoveryTargets();

    expect(targets).toEqual([
      {
        environmentId,
        environmentName: 'Прод',
        serverId: null,
        addresses: [{ name: 'example.com', resolvedIps: ['203.0.113.10'] }],
      },
    ]);
  });

  it('второй проход видит все адреса имени, а не выбранный', async () => {
    // Решение о машине принимается по множеству: имя с двумя адресами
    // не говорит, какая из машин та самая, и заводить по нему запись
    // в реестре нельзя.
    await repository.upsertAddressStatus(
      domainId,
      checked({ resolvedIps: ['203.0.113.11', '203.0.113.10'] }),
    );

    const [target] = await repository.listDiscoveryTargets();

    expect(target?.addresses).toEqual([
      { name: 'example.com', resolvedIps: ['203.0.113.11', '203.0.113.10'] },
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

  describe('машина, на которую смотрит адрес', () => {
    /** Ставит окружение на машину с известным адресом. */
    async function placeOn(ip: string): Promise<void> {
      const [server] = await testDb.db
        .insert(servers)
        .values({ name: 'hetzner-fsn-1', ip })
        .returning();

      await testDb.db
        .update(environments)
        .set({ serverId: server!.id })
        .where(eq(environments.id, environmentId));
    }

    it('адрес, смотрящий не на ту машину, даёт предупреждение', async () => {
      await placeOn('198.51.100.7');
      await repository.upsertAddressStatus(domainId, checked({ resolvedIps: ['203.0.113.10'] }));

      const status = await repository.statusForProject(superadmin(), projectId);

      expect(status.registryWarnings).toContainEqual({
        kind: StatusWarningKind.ServerMismatch,
        subject: 'example.com',
        detail: 'смотрит на 203.0.113.10, а окружение привязано к другой машине',
      });
    });

    it('предупреждение не называет машину', async () => {
      // Имя сервера принадлежит уровню «чтение»: статус его не раскрывает.
      await placeOn('198.51.100.7');
      await repository.upsertAddressStatus(domainId, checked({ resolvedIps: ['203.0.113.10'] }));

      const status = await repository.statusForProject(superadmin(), projectId);

      expect(JSON.stringify(status)).not.toContain('hetzner-fsn-1');
    });

    it('совпавший адрес молчит', async () => {
      await placeOn('203.0.113.10');
      await repository.upsertAddressStatus(domainId, checked({ resolvedIps: ['203.0.113.10'] }));

      const status = await repository.statusForProject(superadmin(), projectId);

      expect(
        status.registryWarnings.some(
          (warning) => warning.kind === StatusWarningKind.ServerMismatch,
        ),
      ).toBe(false);
    });

    it('адрес машины в множестве — расхождения нет', async () => {
      // Балансировка отдаёт пару адресов: пока сравнивался один
      // выбранный, предупреждение мигало от прогона к прогону.
      await placeOn('203.0.113.11');
      await repository.upsertAddressStatus(
        domainId,
        checked({ resolvedIps: ['203.0.113.10', '203.0.113.11'] }),
      );

      const status = await repository.statusForProject(superadmin(), projectId);

      expect(
        status.registryWarnings.some(
          (warning) => warning.kind === StatusWarningKind.ServerMismatch,
        ),
      ).toBe(false);
    });
  });

  describe('предупреждения реестров', () => {
    /** Ставит окружение на машину с близким сроком оплаты. */
    async function placeOnExpiring(): Promise<void> {
      const [server] = await testDb.db
        .insert(servers)
        .values({
          name: 'hetzner-fsn-1',
          ip: '198.51.100.7',
          paidUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        })
        .returning();

      await testDb.db
        .update(environments)
        .set({ serverId: server!.id })
        .where(eq(environments.id, environmentId));
    }

    it('суперадмину приходят отдельным списком, а не вместе с остальными', async () => {
      // Отвечать на них проекту нечем: межпроектную машину и корневой
      // домен правит один суперадмин.
      await placeOnExpiring();
      await repository.upsertAddressStatus(domainId, checked({ resolvedIps: ['203.0.113.10'] }));

      const status = await repository.statusForProject(superadmin(), projectId);

      expect(status.registryWarnings.map((warning) => warning.kind).sort()).toEqual(
        [StatusWarningKind.ServerExpiring, StatusWarningKind.ServerMismatch].sort(),
      );
      expect(
        status.warnings.some((warning) =>
          [
            StatusWarningKind.ServerExpiring,
            StatusWarningKind.ServerMismatch,
            StatusWarningKind.DomainRenewalExpiring,
          ].includes(warning.kind),
        ),
      ).toBe(false);
    });

    it('не-суперадмину не приходят вовсе', async () => {
      // Утечка имени машины в предупреждение на уровне «метаданные»:
      // реестр машин закрыт правом суперадмина целиком.
      await placeOnExpiring();
      await testDb.db.update(domains).set({
        paidUntil: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      });
      await repository.upsertAddressStatus(domainId, checked({ resolvedIps: ['203.0.113.10'] }));
      await grantInfra(AccessLevel.Metadata);

      const status = await repository.statusForProject(member(), projectId);

      expect(status.registryWarnings).toEqual([]);
      expect(JSON.stringify(status)).not.toContain('hetzner-fsn-1');
    });

    it('в сводке по проектам не показываются никому', async () => {
      // У строки сводки нет отдельного списка, а индикатор они не красят:
      // показать их там значило бы вернуть красный, на который нечем
      // ответить.
      await placeOnExpiring();

      const [row] = await repository.summary(superadmin());

      expect(
        row?.warnings.some((warning) => warning.kind === StatusWarningKind.ServerExpiring),
      ).toBe(false);
    });
  });

  describe('жизненный цикл проекта', () => {
    /** Записывает упавший адрес и ставит проекту жизненный цикл. */
    async function fallenWith(lifecycle: ProjectLifecycle): Promise<void> {
      await repository.upsertAddressStatus(
        domainId,
        checked({ health: HealthState.Down, latencyMs: null, healthError: 'HTTP 502' }),
      );
      await testDb.db
        .update(projects)
        .set({ lifecycle })
        .where(eq(projects.id, projectId));
      await grantInfra(AccessLevel.Metadata);
    }

    it('архивный проект не попадает в цели обхода', async () => {
      // Архив никто не чинит: проверять его значит будить человека
      // снятым доменом мёртвого проекта.
      await testDb.db
        .update(projects)
        .set({ lifecycle: ProjectLifecycle.Archived })
        .where(eq(projects.id, projectId));

      expect((await repository.listTargets()).addresses).toEqual([]);
    });

    it('приостановленный проект не сопровождает «Приостановлен» аварией', async () => {
      // Индикатор говорит «приостановлен», а красное «не отвечает» рядом
      // с ним противоречит ему же: стенд погашен намеренно.
      await fallenWith(ProjectLifecycle.Paused);

      const status = await repository.statusForProject(member(), projectId);

      expect(status.indicator).toBe(StatusIndicator.Paused);
      expect(
        status.warnings.some((warning) => warning.kind === StatusWarningKind.HealthDown),
      ).toBe(false);
      // Сам результат проверки не прячется: он остаётся у адреса.
      expect(status.domains[0]?.health).toBe(HealthState.Down);
    });

    it('архивный проект не предупреждает и аварией не светится', async () => {
      await fallenWith(ProjectLifecycle.Archived);

      const status = await repository.statusForProject(member(), projectId);

      expect(status.indicator).not.toBe(StatusIndicator.Down);
      expect(status.warnings).toEqual([]);
    });
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

    it('предупреждает о близком сроке, но индикатор проекта не красит', async () => {
      // Межпроектную машину правит один суперадмин: проекту по такому
      // предупреждению делать нечего, и красный индикатор, на который
      // нельзя ответить действием, обесценивает тот, на который можно.
      await placeOnServer('hetzner-fsn-1', inDays(3));

      const status = await repository.statusForProject(superadmin(), projectId);

      expect(status.registryWarnings).toContainEqual(
        expect.objectContaining({
          kind: StatusWarningKind.ServerExpiring,
          subject: 'hetzner-fsn-1',
        }),
      );
      // Ни один адрес проекта не проверялся: индикатор об этом и говорит.
      expect(status.indicator).toBe(StatusIndicator.Unknown);
    });

    it('не раскрывает соседей по машине', async () => {
      // В предупреждении только имя машины: список её проектов не должен
      // просачиваться в статус чужого проекта.
      await placeOnServer('hetzner-fsn-1', inDays(3));

      const status = await repository.statusForProject(superadmin(), projectId);
      const serverWarning = status.registryWarnings.find(
        (warning) => warning.kind === StatusWarningKind.ServerExpiring,
      );

      // Состав полей закрыт: лишнее поле в предупреждении — лишнее
      // сведение о межпроектной машине.
      expect(Object.keys(serverWarning ?? {}).sort()).toEqual(
        ['date', 'days', 'detail', 'kind', 'subject', 'threshold'].sort(),
      );
    });

    it('молчит, когда срок далёк или сервера нет', async () => {
      await placeOnServer('hetzner-fsn-1', inDays(60));

      const withFarDate = await repository.statusForProject(superadmin(), projectId);

      expect(
        withFarDate.registryWarnings.some(
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

      const status = await repository.statusForProject(superadmin(), projectId);

      expect(
        status.registryWarnings.filter(
          (warning) => warning.kind === StatusWarningKind.ServerExpiring,
        ),
      ).toHaveLength(1);
    });
  });

  describe('срок продления домена в статусе проекта', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;

    /** Календарный день через `days` суток от сегодня в формате контракта. */
    function inDays(days: number): string {
      return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
    }

    it('предупреждает о близком продлении, но индикатор проекта не красит', async () => {
      // Корень межпроектный, и срок продления правит суперадмин: то же
      // правило, что у срока оплаты машины.
      await testDb.db.update(domains).set({ paidUntil: inDays(5) });

      const status = await repository.statusForProject(superadmin(), projectId);

      expect(status.registryWarnings).toContainEqual(
        expect.objectContaining({
          kind: StatusWarningKind.DomainRenewalExpiring,
          subject: 'example.com',
        }),
      );
      expect(status.indicator).toBe(StatusIndicator.Unknown);
    });

    it('даёт одно предупреждение на корень, а не на каждый поддомен', async () => {
      const [root] = await testDb.db.select().from(domains);
      await testDb.db.update(domains).set({ paidUntil: inDays(5) });
      await testDb.db
        .insert(environmentDomains)
        .values({ environmentId, domainId: root!.id, name: 'stage.example.com' });

      const status = await repository.statusForProject(superadmin(), projectId);

      expect(
        status.registryWarnings.filter(
          (warning) => warning.kind === StatusWarningKind.DomainRenewalExpiring,
        ),
      ).toHaveLength(1);
    });

    it('молчит, когда срок далёк', async () => {
      await testDb.db.update(domains).set({ paidUntil: inDays(90) });

      const status = await repository.statusForProject(superadmin(), projectId);

      expect(
        status.registryWarnings.some(
          (warning) => warning.kind === StatusWarningKind.DomainRenewalExpiring,
        ),
      ).toBe(false);
    });
  });
});
