import { EnvironmentKind, HealthState, StatusIndicator, StatusWarningKind } from '@cairn/shared';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  domainStatuses,
  domains,
  environmentDomains,
  environments,
  projects,
  servers,
} from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';
import { ServersRepository } from './servers.repository';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Календарный день через `days` суток от сегодня в формате контракта. */
function inDays(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
}

describe('репозиторий серверов', () => {
  let testDb: TestDatabase;
  let repository: ServersRepository;
  let projectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new ServersRepository(testDb.db);
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'vitrina', name: 'Витрина' })
      .returning();
    projectId = project!.id;
  });

  /**
   * Заводит окружение проекта на сервере и, если задан, результат проверки.
   *
   * Здоровье живёт у адреса: чтобы окружение было чем проверять, ему
   * заводится домен, и результат пишется по нему.
   */
  async function addEnvironment(
    serverId: string | null,
    name: string,
    health?: HealthState,
  ): Promise<string> {
    const [environment] = await testDb.db
      .insert(environments)
      .values({ projectId, name, kind: EnvironmentKind.Production, serverId })
      .returning();

    if (health) {
      const [root] = await testDb.db
        .insert(domains)
        .values({ name: 'example.com' })
        .onConflictDoNothing()
        .returning();
      const [existing] = await testDb.db.select().from(domains);
      const [address] = await testDb.db
        .insert(environmentDomains)
        .values({
          environmentId: environment!.id,
          domainId: (root ?? existing)!.id,
          name: `${name.toLowerCase()}.example.com`,
        })
        .returning();

      await testDb.db.insert(domainStatuses).values({ domainId: address!.id, health });
    }

    return environment!.id;
  }

  describe('создание', () => {
    it('заводит сервер и показывает его в реестре', async () => {
      await testDb.db.transaction((tx) =>
        repository.create(tx, { name: 'hetzner-fsn-1', owner: 'ООО Ромашка' }),
      );

      const [row] = await repository.list();

      expect(row).toMatchObject({
        name: 'hetzner-fsn-1',
        owner: 'ООО Ромашка',
        projectCount: 0,
        environmentCount: 0,
        indicator: StatusIndicator.Unknown,
      });
    });

    it('отвечает конфликтом на повтор имени', async () => {
      // Ограничение есть и в базе, но человеку нужен внятный отказ,
      // а не 500 от сырого нарушения ключа.
      await testDb.db.transaction((tx) => repository.create(tx, { name: 'srv' }));

      await expect(
        testDb.db.transaction((tx) => repository.create(tx, { name: 'srv' })),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('реестр', () => {
    it('считает проекты, а не окружения', async () => {
      const [server] = await testDb.db.insert(servers).values({ name: 'srv' }).returning();
      await addEnvironment(server!.id, 'Прод');
      await addEnvironment(server!.id, 'Стейдж');

      const [row] = await repository.list();

      expect(row).toMatchObject({ projectCount: 1, environmentCount: 2 });
    });

    it('собирает индикатор из статусов окружений', async () => {
      const [server] = await testDb.db.insert(servers).values({ name: 'srv' }).returning();
      await addEnvironment(server!.id, 'Прод', HealthState.Down);
      await addEnvironment(server!.id, 'Стейдж', HealthState.Up);

      const [row] = await repository.list();

      expect(row?.indicator).toBe(StatusIndicator.Warning);
    });

    it('предупреждает о близком сроке оплаты', async () => {
      await testDb.db.insert(servers).values({ name: 'srv', paidUntil: inDays(3) });

      const [row] = await repository.list();

      expect(row?.indicator).toBe(StatusIndicator.Warning);
      expect(row?.warnings[0]).toMatchObject({
        kind: StatusWarningKind.ServerExpiring,
        subject: 'srv',
      });
    });

    it('перечисляет серверы по имени', async () => {
      await testDb.db.insert(servers).values([{ name: 'бета' }, { name: 'альфа' }]);

      expect((await repository.list()).map((row) => row.name)).toEqual(['альфа', 'бета']);
    });
  });

  describe('детали', () => {
    it('перечисляет окружения вместе с их проектами', async () => {
      const [server] = await testDb.db.insert(servers).values({ name: 'srv' }).returning();
      await addEnvironment(server!.id, 'Прод', HealthState.Up);

      const detail = await repository.findById(server!.id);

      expect(detail.environments).toEqual([
        expect.objectContaining({
          name: 'Прод',
          projectName: 'Витрина',
          projectId,
          health: HealthState.Up,
        }),
      ]);
    });

    it('неизвестный сервер — не найден', async () => {
      await expect(
        repository.findById('11111111-1111-1111-1111-111111111111'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('правка и удаление', () => {
    it('меняет срок оплаты', async () => {
      const [server] = await testDb.db.insert(servers).values({ name: 'srv' }).returning();

      const updated = await testDb.db.transaction((tx) =>
        repository.update(tx, server!.id, { paidUntil: '2027-01-01' }),
      );

      expect(updated.paidUntil).toBe('2027-01-01');
    });

    it('удаляет пустой сервер', async () => {
      const [server] = await testDb.db.insert(servers).values({ name: 'srv' }).returning();

      await testDb.db.transaction((tx) => repository.remove(tx, server!.id));

      expect(await repository.list()).toEqual([]);
    });

    it('отказывается удалять сервер с окружениями', async () => {
      // Удаление машины должно быть осознанным переносом, а не тихим обрывом связи.
      const [server] = await testDb.db.insert(servers).values({ name: 'srv' }).returning();
      await addEnvironment(server!.id, 'Прод');

      await expect(
        testDb.db.transaction((tx) => repository.remove(tx, server!.id)),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('заведение машины проверкой', () => {
    it('отдаёт реестр, разложенный по адресу', async () => {
      await testDb.db.insert(servers).values({ name: 'hetzner-fsn-1', ip: '203.0.113.10' });

      const byIp = await repository.machinesByIp();

      expect(byIp.get('203.0.113.10')).toHaveLength(1);
    });

    it('машины без адреса в разбор не попадают', async () => {
      await testDb.db.insert(servers).values({ name: 'старая-запись' });

      expect(await repository.machinesByIp()).toEqual(new Map());
    });

    it('заводит машину под именем её адреса', async () => {
      // Больше система о ней не знает: имя, владельца и срок оплаты
      // допишет человек.
      const created = await repository.createDiscovered('203.0.113.10');

      expect(created).toMatchObject({ name: '203.0.113.10', ip: '203.0.113.10', owner: null });
    });

    it('ставит привязку окружению', async () => {
      const environmentId = await addEnvironment(null, 'Прод');
      const created = await repository.createDiscovered('203.0.113.10');

      await repository.bindEnvironment(environmentId, created.id);

      const [environment] = await testDb.db
        .select()
        .from(environments)
        .where(eq(environments.id, environmentId));

      expect(environment?.serverId).toBe(created.id);
    });

    it('привязку, поставленную человеком, не перетирает', async () => {
      // Защита на уровне запроса, а не только правила: второй вызов
      // не должен переехать окружение молча.
      const environmentId = await addEnvironment(null, 'Прод');
      const first = await repository.createDiscovered('203.0.113.10');
      const second = await repository.createDiscovered('198.51.100.7');
      await repository.bindEnvironment(environmentId, first.id);

      await repository.bindEnvironment(environmentId, second.id);

      const [environment] = await testDb.db
        .select()
        .from(environments)
        .where(eq(environments.id, environmentId));

      expect(environment?.serverId).toBe(first.id);
    });
  });
});
