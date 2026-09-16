import { AccessLevel, EnvironmentKind, HealthState, Section, SubjectKind } from '@cairn/shared';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccessService } from '../access/access.service';
import { DomainsRepository } from '../domains/domains.repository';
import { InsufficientLevelError, SectionNotVisibleError } from '../access/access.errors';
import type { RequestSubject } from '../access/access.types';
import {
  domainStatuses,
  domains,
  environmentDomains,
  environmentStatuses,
  environments,
  grants,
  projects,
  servers,
  subjects,
  users,
  variables,
} from '../db/schema';
import { EnvironmentsRepository } from './environments.repository';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('репозиторий окружений', () => {
  let testDb: TestDatabase;
  let repository: EnvironmentsRepository;
  let projectId: string;
  let otherProjectId: string;
  let subjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new EnvironmentsRepository(testDb.db, new AccessService(testDb.db), new DomainsRepository(testDb.db));
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

    const [other] = await testDb.db
      .insert(projects)
      .values({ slug: 'chuzhoj', name: 'Чужой' })
      .returning();
    otherProjectId = other!.id;
  });

  /** Субъект без суперадминства: права даёт только выдача. */
  const member = (): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'user@cairn.local',
    isSuperadmin: false,
    isRevoked: false,
  });

  const admin = (): RequestSubject => ({
    id: 'неважно',
    kind: SubjectKind.User,
    label: 'admin@cairn.local',
    isSuperadmin: true,
    isRevoked: false,
  });

  async function grant(level: AccessLevel): Promise<void> {
    await testDb.db.insert(grants).values({
      subjectId,
      projectId,
      section: Section.Infrastructure,
      level,
      grantedBy: adminUserId,
    });
  }

  async function createProd(): Promise<string> {
    const created = await testDb.db.transaction((tx) =>
      repository.create(admin(), tx, projectId, {
        name: 'Прод',
        kind: EnvironmentKind.Production,
        domains: ['example.com'],
      }),
    );

    return created.id;
  }

  describe('создание', () => {
    it('создаёт окружение с доменами', async () => {
      const id = await createProd();

      const [row] = await testDb.db.select().from(environments).where(eq(environments.id, id));
      const domains = await testDb.db
        .select()
        .from(environmentDomains)
        .where(eq(environmentDomains.environmentId, id));

      expect(row?.name).toBe('Прод');
      expect(domains.map((domain) => domain.name)).toEqual(['example.com']);
    });

    it('отказывает субъекту с уровнем чтения', async () => {
      await grant(AccessLevel.Read);

      await expect(
        testDb.db.transaction((tx) =>
          repository.create(member(), tx, projectId, {
            name: 'Стейдж',
            kind: EnvironmentKind.Staging,
          }),
        ),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });

    it('скрывает существование проекта от субъекта без выдачи', async () => {
      await expect(
        testDb.db.transaction((tx) =>
          repository.create(member(), tx, projectId, {
            name: 'Стейдж',
            kind: EnvironmentKind.Staging,
          }),
        ),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });

    it('не допускает двух окружений с одним именем в проекте', async () => {
      await createProd();

      await expect(
        testDb.db.transaction((tx) =>
          repository.create(admin(), tx, projectId, {
            name: 'Прод',
            kind: EnvironmentKind.Production,
          }),
        ),
      ).rejects.toThrow();
    });

    it('допускает одноимённые окружения в разных проектах', async () => {
      await createProd();

      const created = await testDb.db.transaction((tx) =>
        repository.create(admin(), tx, otherProjectId, {
          name: 'Прод',
          kind: EnvironmentKind.Production,
        }),
      );

      expect(created.id).toBeDefined();
    });
  });

  describe('чтение', () => {
    it('на уровне метаданных не отдаёт IP', async () => {
      await createProd();
      await grant(AccessLevel.Metadata);

      const [environment] = await repository.findForProject(member(), projectId);

      expect(environment).toMatchObject({ name: 'Прод', domains: ['example.com'] });
      expect('ip' in environment!).toBe(false);
    });

    it('на уровне чтения отдаёт машину вложенным объектом', async () => {
      const id = await createProd();
      const [server] = await testDb.db
        .insert(servers)
        .values({ name: 'hetzner-fsn-1', ip: '203.0.113.10' })
        .returning();
      await testDb.db
        .update(environments)
        .set({ serverId: server!.id })
        .where(eq(environments.id, id));
      await grant(AccessLevel.Read);

      const [environment] = await repository.findForProject(member(), projectId);

      expect(environment).toMatchObject({
        server: expect.objectContaining({ name: 'hetzner-fsn-1', ip: '203.0.113.10' }),
      });
    });

    it('на уровне чтения отдаёт пустую машину, когда окружение не привязано', async () => {
      await createProd();
      await grant(AccessLevel.Read);

      const [environment] = await repository.findForProject(member(), projectId);

      expect(environment).toMatchObject({ server: null });
    });

    it('скрывает секцию от субъекта без выдачи', async () => {
      await createProd();

      await expect(repository.findForProject(member(), projectId)).rejects.toBeInstanceOf(
        SectionNotVisibleError,
      );
    });

    it('выдача на другую секцию доступа к инфраструктуре не даёт', async () => {
      // Выдачи адресуются паре «проект × секция», и доступ к «Инфо»
      // не должен открывать окружения (ТЗ 4.1).
      await createProd();
      await testDb.db.insert(grants).values({
        subjectId,
        projectId,
        section: Section.Info,
        level: AccessLevel.Write,
        grantedBy: adminUserId,
      });

      await expect(repository.findForProject(member(), projectId)).rejects.toBeInstanceOf(
        SectionNotVisibleError,
      );
    });

    it('показывает прод раньше остальных окружений', async () => {
      await testDb.db.transaction(async (tx) => {
        await repository.create(admin(), tx, projectId, {
          name: 'Дев',
          kind: EnvironmentKind.Development,
        });
        await repository.create(admin(), tx, projectId, {
          name: 'Прод',
          kind: EnvironmentKind.Production,
        });
      });

      const list = await repository.findForProject(admin(), projectId);

      expect(list.map((environment) => environment.name)).toEqual(['Прод', 'Дев']);
    });

    it('возвращает окружение по идентификатору', async () => {
      const id = await createProd();
      await grant(AccessLevel.Read);

      const environment = await repository.findById(member(), projectId, id);

      expect(environment).toMatchObject({ id, name: 'Прод' });
    });

    it('не отдаёт окружение через чужой проект', async () => {
      // Иначе идентификатор окружения из доступного проекта стал бы
      // ключом к окружению недоступного.
      const id = await createProd();

      await expect(repository.findById(admin(), otherProjectId, id)).rejects.toBeInstanceOf(
        SectionNotVisibleError,
      );
    });
  });

  describe('правка', () => {
    it('меняет переданные поля и не трогает остальные', async () => {
      const id = await createProd();

      const updated = await testDb.db.transaction((tx) =>
        repository.update(admin(), tx, projectId, id, { notes: 'Заметка' }),
      );

      expect(updated.notes).toBe('Заметка');
      expect(updated.name).toBe('Прод');

      // Домены живут отдельной таблицей: правка других полей не должна их
      // трогать, иначе заметка стирала бы адрес окружения.
      const environment = await repository.findById(admin(), projectId, id);

      expect(environment).toMatchObject({ domains: ['example.com'] });
    });

    it('привязку к серверу задаёт только суперадмин', async () => {
      // Выпадающий список машин межпроектен: показать его подрядчику значило
      // бы раскрыть чужую инфраструктуру именами серверов.
      const id = await createProd();
      const [server] = await testDb.db.insert(servers).values({ name: 'srv' }).returning();
      await grant(AccessLevel.Write);

      await expect(
        testDb.db.transaction((tx) =>
          repository.update(member(), tx, projectId, id, { serverId: server!.id }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      const updated = await testDb.db.transaction((tx) =>
        repository.update(admin(), tx, projectId, id, { serverId: server!.id }),
      );

      expect(updated.serverId).toBe(server!.id);
    });

    it('суперадмин отвязывает окружение от сервера', async () => {
      const id = await createProd();
      const [server] = await testDb.db.insert(servers).values({ name: 'srv' }).returning();

      await testDb.db.transaction((tx) =>
        repository.update(admin(), tx, projectId, id, { serverId: server!.id }),
      );
      const updated = await testDb.db.transaction((tx) =>
        repository.update(admin(), tx, projectId, id, { serverId: null }),
      );

      expect(updated.serverId).toBeNull();
    });

    it('заменяет набор доменов целиком', async () => {
      const id = await createProd();

      await testDb.db.transaction((tx) =>
        repository.update(admin(), tx, projectId, id, { domains: ['api.example.com'] }),
      );

      const domains = await testDb.db
        .select()
        .from(environmentDomains)
        .where(eq(environmentDomains.environmentId, id));

      expect(domains.map((domain) => domain.name)).toEqual(['api.example.com']);
    });

    it('заменяет домены и после прогона автопроверок', async () => {
      // Статус ссылается на домен с restrict: без явной очистки статусов
      // замена доменов падала бы по внешнему ключу (как в remove).
      const id = await createProd();
      const [domain] = await testDb.db
        .select()
        .from(environmentDomains)
        .where(eq(environmentDomains.environmentId, id));
      await testDb.db.insert(domainStatuses).values({
        domainId: domain!.id,
        tlsError: 'getaddrinfo ENOTFOUND example.com',
      });

      await testDb.db.transaction((tx) =>
        repository.update(admin(), tx, projectId, id, { domains: [] }),
      );

      const remaining = await testDb.db
        .select()
        .from(environmentDomains)
        .where(eq(environmentDomains.environmentId, id));

      expect(remaining).toHaveLength(0);
    });

    it('не трогает домены, если поле не передано', async () => {
      // Иначе правка одной лишь заметки стирала бы адреса.
      const id = await createProd();

      await testDb.db.transaction((tx) =>
        repository.update(admin(), tx, projectId, id, { notes: 'Заметка' }),
      );

      const domains = await testDb.db
        .select()
        .from(environmentDomains)
        .where(eq(environmentDomains.environmentId, id));

      expect(domains).toHaveLength(1);
    });

    it('отказывает субъекту с уровнем чтения', async () => {
      const id = await createProd();
      await grant(AccessLevel.Read);

      await expect(
        testDb.db.transaction((tx) =>
          repository.update(member(), tx, projectId, id, { notes: 'Заметка' }),
        ),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });

    it('обновляет отметку времени', async () => {
      const id = await createProd();

      const updated = await testDb.db.transaction((tx) =>
        repository.update(admin(), tx, projectId, id, { notes: 'Заметка' }),
      );

      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(updated.createdAt.getTime());
    });
  });

  describe('удаление', () => {
    it('удаляет окружение вместе с доменами', async () => {
      const id = await createProd();

      await testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, id));

      const rows = await testDb.db.select().from(environments);
      const domains = await testDb.db.select().from(environmentDomains);

      expect(rows).toHaveLength(0);
      expect(domains).toHaveLength(0);
    });

    it('возвращает удалённое окружение', async () => {
      // Имя нужно журналу: после удаления строки его больше неоткуда взять.
      const id = await createProd();

      const removed = await testDb.db.transaction((tx) =>
        repository.remove(admin(), tx, projectId, id),
      );

      expect(removed.name).toBe('Прод');
    });

    it('отказывает субъекту с уровнем чтения', async () => {
      const id = await createProd();
      await grant(AccessLevel.Read);

      await expect(
        testDb.db.transaction((tx) => repository.remove(member(), tx, projectId, id)),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });

    it('удаляет окружение вместе со строками статусов', async () => {
      // Статусы — производные данные; пережить своё окружение они не должны.
      const id = await createProd();
      const [domain] = await testDb.db
        .select()
        .from(environmentDomains)
        .where(eq(environmentDomains.environmentId, id));
      await testDb.db
        .insert(environmentStatuses)
        .values({ environmentId: id, health: HealthState.Up });
      await testDb.db.insert(domainStatuses).values({ domainId: domain!.id });

      await testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, id));

      expect(await testDb.db.select().from(environmentStatuses)).toHaveLength(0);
      expect(await testDb.db.select().from(domainStatuses)).toHaveLength(0);
    });

    it('не удаляет окружение, у которого есть переменные', async () => {
      // Обещание спеки этапа 2 (раздел 10): переменные привязываются
      // к окружению, и его удаление не должно тихо уносить секреты.
      const id = await createProd();
      const [variable] = await testDb.db
        .insert(variables)
        .values({ environmentId: id, key: 'KEY' })
        .returning();

      await expect(
        testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, id)),
      ).rejects.toBeInstanceOf(ConflictException);

      await testDb.db.delete(variables).where(eq(variables.id, variable!.id));

      await expect(
        testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, id)),
      ).resolves.toBeDefined();
    });

    it('сообщает «не найдено» об уже удалённом окружении', async () => {
      const id = await createProd();
      await testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, id));

      await expect(
        testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, id)),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });
  });

  describe('корень домена', () => {
    it('подрядчик заводит домен окружения, а корень появляется сам', async () => {
      // Адрес стенда — рабочая мелочь, ради которой нельзя дёргать
      // владельца реестра (спека этапа 10, раздел 3).
      await grant(AccessLevel.Write);

      await testDb.db.transaction((tx) =>
        repository.create(member(), tx, projectId, {
          name: 'Стейдж',
          kind: EnvironmentKind.Staging,
          domains: ['stage.example.com'],
        }),
      );

      const roots = await testDb.db.select().from(domains);

      expect(roots).toHaveLength(1);
      expect(roots[0]).toMatchObject({ name: 'example.com', owner: null, paidUntil: null });
    });

    it('поддомены одного корня не плодят записей реестра', async () => {
      await testDb.db.transaction((tx) =>
        repository.create(admin(), tx, projectId, {
          name: 'Стейдж',
          kind: EnvironmentKind.Staging,
          domains: ['stage.example.com', 'api.example.com', 'example.com'],
        }),
      );

      expect(await testDb.db.select().from(domains)).toHaveLength(1);
    });

    it('корень одной зоны разрешается один раз на все свои поддомены', async () => {
      // Домены окружения могут исчисляться десятками, а корень у них
      // обычно один: разрешать его на каждое имя — лишние запросы
      // в транзакции, которая держит окружение.
      const domainsRepository = new DomainsRepository(testDb.db);
      const ensureRoot = vi.spyOn(domainsRepository, 'ensureRoot');
      const counting = new EnvironmentsRepository(
        testDb.db,
        new AccessService(testDb.db),
        domainsRepository,
      );

      await testDb.db.transaction((tx) =>
        counting.create(admin(), tx, projectId, {
          name: 'Стейдж',
          kind: EnvironmentKind.Staging,
          domains: ['stage.example.com', 'api.example.com', 'www.example.com'],
        }),
      );

      expect(ensureRoot).toHaveBeenCalledTimes(1);
    });

    it('домены разных зон дают разные корни', async () => {
      await testDb.db.transaction((tx) =>
        repository.create(admin(), tx, projectId, {
          name: 'Стейдж',
          kind: EnvironmentKind.Staging,
          domains: ['stage.example.com', 'api.shop.co.uk'],
        }),
      );

      const roots = await testDb.db.select().from(domains).orderBy(asc(domains.name));

      expect(roots.map((root) => root.name)).toEqual(['example.com', 'shop.co.uk']);
    });

    it('правка не сбрасывает свойства уже заведённого корня', async () => {
      const id = await createProd();
      await testDb.db.transaction((tx) =>
        repository.update(admin(), tx, projectId, id, { domains: ['example.com'] }),
      );
      await testDb.db.update(domains).set({ owner: 'ООО Ромашка' });

      await testDb.db.transaction((tx) =>
        repository.update(admin(), tx, projectId, id, { domains: ['stage.example.com'] }),
      );

      const [root] = await testDb.db.select().from(domains);

      expect(root?.owner).toBe('ООО Ромашка');
    });
  });
});
