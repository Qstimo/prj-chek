import { EnvironmentKind, StatusIndicator, StatusWarningKind } from '@cairn/shared';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { domains, environmentDomains, environments, projects } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';
import { DomainsRepository } from './domains.repository';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Календарный день через `days` суток от сегодня в формате контракта. */
function inDays(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
}

describe('репозиторий доменов', () => {
  let testDb: TestDatabase;
  let repository: DomainsRepository;
  let projectId: string;
  let environmentId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new DomainsRepository(testDb.db);
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

    const [environment] = await testDb.db
      .insert(environments)
      .values({ projectId, name: 'Прод', kind: EnvironmentKind.Production })
      .returning();
    environmentId = environment!.id;
  });

  /** Заводит корень и вешает на него поддомен окружения. */
  async function addSubdomain(rootId: string, name: string): Promise<void> {
    await testDb.db
      .insert(environmentDomains)
      .values({ environmentId, domainId: rootId, name });
  }

  describe('создание', () => {
    it('заводит корень и показывает его в реестре', async () => {
      await testDb.db.transaction((tx) =>
        repository.create(tx, { name: 'example.com', owner: 'ООО Ромашка', registrar: 'REG.RU' }),
      );

      const [row] = await repository.list();

      expect(row).toMatchObject({
        name: 'example.com',
        owner: 'ООО Ромашка',
        registrar: 'REG.RU',
        subdomainCount: 0,
        projectCount: 0,
        indicator: StatusIndicator.Unknown,
      });
    });

    it('отвечает конфликтом на повтор имени', async () => {
      await testDb.db.transaction((tx) => repository.create(tx, { name: 'example.com' }));

      await expect(
        testDb.db.transaction((tx) => repository.create(tx, { name: 'example.com' })),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('автозаведение корня', () => {
    it('заводит корень по имени поддомена', async () => {
      const root = await testDb.db.transaction((tx) =>
        repository.ensureRoot(tx, 'stage.example.com'),
      );

      expect(root.name).toBe('example.com');
      expect(root.owner).toBeNull();
    });

    it('повторный вызов не плодит записи', async () => {
      await testDb.db.transaction(async (tx) => {
        await repository.ensureRoot(tx, 'stage.example.com');
        await repository.ensureRoot(tx, 'api.example.com');
      });

      expect(await testDb.db.select().from(domains)).toHaveLength(1);
    });

    it('не трогает свойства уже заведённого корня', async () => {
      await testDb.db.transaction((tx) =>
        repository.create(tx, { name: 'example.com', owner: 'ООО Ромашка' }),
      );

      const root = await testDb.db.transaction((tx) =>
        repository.ensureRoot(tx, 'stage.example.com'),
      );

      expect(root.owner).toBe('ООО Ромашка');
    });
  });

  describe('реестр', () => {
    it('считает проекты, а не поддомены', async () => {
      const [root] = await testDb.db.insert(domains).values({ name: 'example.com' }).returning();
      await addSubdomain(root!.id, 'example.com');
      await addSubdomain(root!.id, 'stage.example.com');

      const [row] = await repository.list();

      expect(row).toMatchObject({ subdomainCount: 2, projectCount: 1 });
    });

    it('предупреждает о близком сроке продления', async () => {
      await testDb.db.insert(domains).values({ name: 'example.com', paidUntil: inDays(5) });

      const [row] = await repository.list();

      expect(row?.indicator).toBe(StatusIndicator.Warning);
      expect(row?.warnings[0]).toMatchObject({
        kind: StatusWarningKind.DomainRenewalExpiring,
        subject: 'example.com',
      });
    });

    it('отдаёт поддомены вместе со строкой реестра', async () => {
      // Реестр рисуется деревом, а данные уже подняты ради счётчиков:
      // платить вторым запросом на каждый корень незачем.
      const [root] = await testDb.db.insert(domains).values({ name: 'example.com' }).returning();
      await addSubdomain(root!.id, 'stage.example.com');

      const [row] = await repository.list();

      expect(row?.subdomains).toEqual([
        expect.objectContaining({ name: 'stage.example.com', projectName: 'Витрина', projectId }),
      ]);
    });

    it('корень без поддоменов отдаёт пустой список', async () => {
      await testDb.db.insert(domains).values({ name: 'example.com' });

      const [row] = await repository.list();

      expect(row?.subdomains).toEqual([]);
    });

    it('перечисляет корни по имени', async () => {
      await testDb.db.insert(domains).values([{ name: 'beta.com' }, { name: 'alpha.com' }]);

      expect((await repository.list()).map((row) => row.name)).toEqual([
        'alpha.com',
        'beta.com',
      ]);
    });
  });

  describe('детали', () => {
    it('перечисляет поддомены вместе с окружениями и проектами', async () => {
      const [root] = await testDb.db.insert(domains).values({ name: 'example.com' }).returning();
      await addSubdomain(root!.id, 'stage.example.com');

      const detail = await repository.findById(root!.id);

      expect(detail.subdomains).toEqual([
        expect.objectContaining({
          name: 'stage.example.com',
          environmentName: 'Прод',
          projectName: 'Витрина',
          projectId,
        }),
      ]);
    });

    it('неизвестный корень — не найден', async () => {
      await expect(
        repository.findById('11111111-1111-1111-1111-111111111111'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('правка и удаление', () => {
    it('меняет срок продления', async () => {
      const [root] = await testDb.db.insert(domains).values({ name: 'example.com' }).returning();

      const updated = await testDb.db.transaction((tx) =>
        repository.update(tx, root!.id, { paidUntil: '2027-01-01' }),
      );

      expect(updated.paidUntil).toBe('2027-01-01');
    });

    it('удаляет корень без поддоменов', async () => {
      const [root] = await testDb.db.insert(domains).values({ name: 'example.com' }).returning();

      await testDb.db.transaction((tx) => repository.remove(tx, root!.id));

      expect(await repository.list()).toEqual([]);
    });

    it('отказывается удалять корень с поддоменами', async () => {
      const [root] = await testDb.db.insert(domains).values({ name: 'example.com' }).returning();
      await addSubdomain(root!.id, 'stage.example.com');

      await expect(
        testDb.db.transaction((tx) => repository.remove(tx, root!.id)),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
