import { AccessLevel, EnvironmentKind, Section, SubjectKind } from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import { InsufficientLevelError, SectionNotVisibleError } from '../access/access.errors';
import type { RequestSubject } from '../access/access.types';
import { environmentDomains, environments, grants, projects, subjects, users } from '../db/schema';
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
    repository = new EnvironmentsRepository(testDb.db, new AccessService(testDb.db));
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
        ip: '203.0.113.10',
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

    it('на уровне чтения отдаёт IP', async () => {
      await createProd();
      await grant(AccessLevel.Read);

      const [environment] = await repository.findForProject(member(), projectId);

      expect(environment).toMatchObject({ ip: '203.0.113.10' });
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
        repository.update(admin(), tx, projectId, id, { provider: 'Hetzner' }),
      );

      expect(updated.provider).toBe('Hetzner');
      expect(updated.ip).toBe('203.0.113.10');
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

    it('не трогает домены, если поле не передано', async () => {
      // Иначе правка одного лишь провайдера стирала бы адреса.
      const id = await createProd();

      await testDb.db.transaction((tx) =>
        repository.update(admin(), tx, projectId, id, { provider: 'Hetzner' }),
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
          repository.update(member(), tx, projectId, id, { provider: 'Hetzner' }),
        ),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });

    it('обновляет отметку времени', async () => {
      const id = await createProd();

      const updated = await testDb.db.transaction((tx) =>
        repository.update(admin(), tx, projectId, id, { provider: 'Hetzner' }),
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

    it('сообщает «не найдено» об уже удалённом окружении', async () => {
      const id = await createProd();
      await testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, id));

      await expect(
        testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, id)),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });
  });
});
