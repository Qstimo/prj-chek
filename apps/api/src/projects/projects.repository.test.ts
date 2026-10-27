import {
  AccessLevel,
  EnvironmentKind,
  PlatformKind,
  ProjectLifecycle,
  Section,
  SubjectKind,
} from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import { InsufficientLevelError, SectionNotVisibleError } from '../access/access.errors';
import type { RequestSubject } from '../access/access.types';
import { ProjectsRepository } from './projects.repository';
import {
  domains,
  environmentDomains,
  environments,
  grants,
  projectPlatforms,
  projects,
  servers,
  subjects,
  users,
} from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('ProjectsRepository', () => {
  let testDb: TestDatabase;
  let repository: ProjectsRepository;
  let subjectId: string;
  let grantedBy: string;
  let projectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new ProjectsRepository(testDb.db, new AccessService(testDb.db));
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'подрядчик' })
      .returning();
    subjectId = subject!.id;

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'админ' })
      .returning();
    const [admin] = await testDb.db
      .insert(users)
      .values({ subjectId: adminSubject!.id, email: 'admin@cairn.local', isSuperadmin: true })
      .returning();
    grantedBy = admin!.id;

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект', purpose: 'Назначение' })
      .returning();
    projectId = project!.id;
  });

  const subject = (overrides: Partial<RequestSubject> = {}): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'подрядчик',
    isSuperadmin: false,
    isRevoked: false,
    ...overrides,
  });

  async function grant(level: AccessLevel): Promise<void> {
    await testDb.db
      .insert(grants)
      .values({ subjectId, projectId, section: Section.Info, level, grantedBy });
  }

  describe('findById', () => {
    it('без доступа бросает «не найдено»', async () => {
      await expect(repository.findById(subject(), projectId)).rejects.toBeInstanceOf(
        SectionNotVisibleError,
      );
    });

    it('на уровне метаданных не отдаёт назначение', async () => {
      await grant(AccessLevel.Metadata);

      expect(await repository.findById(subject(), projectId)).not.toHaveProperty('purpose');
    });

    it('на уровне чтения отдаёт назначение', async () => {
      await grant(AccessLevel.Read);

      expect(await repository.findById(subject(), projectId)).toMatchObject({
        purpose: 'Назначение',
      });
    });
  });

  describe('findVisible', () => {
    it('без выдач возвращает пустой список', async () => {
      expect(await repository.findVisible(subject())).toEqual([]);
    });

    it('возвращает обзор без паспорта и без полей чужих секций', async () => {
      await grant(AccessLevel.Metadata);

      const visible = await repository.findVisible(subject());

      expect(visible).toHaveLength(1);
      expect(visible[0]).not.toHaveProperty('purpose');
      expect(visible[0]).toMatchObject({
        updatedAt: null,
        platforms: [],
        productionDomain: null,
        productionServerName: null,
      });
    });

    it('суперадмину возвращает все проекты', async () => {
      expect(await repository.findVisible(subject({ isSuperadmin: true }))).toHaveLength(1);
    });

    it('отдаёт updatedAt и платформы при достаточном Info', async () => {
      await grant(AccessLevel.Read);
      await testDb.db.insert(projectPlatforms).values([
        { projectId, kind: PlatformKind.Server, name: 'API', position: 2 },
        { projectId, kind: PlatformKind.Store, name: 'RuStore', position: 1 },
      ]);

      const [item] = await repository.findVisible(subject());

      expect(item?.updatedAt).toEqual(expect.any(String));
      expect(item?.platforms.map((platform) => platform.name)).toEqual(['RuStore', 'API']);
    });

    it('выбирает прод-домен и сервер по name ASC', async () => {
      await testDb.db.insert(grants).values([
        {
          subjectId,
          projectId,
          section: Section.Info,
          level: AccessLevel.Metadata,
          grantedBy,
        },
        {
          subjectId,
          projectId,
          section: Section.Infrastructure,
          level: AccessLevel.Read,
          grantedBy,
        },
      ]);

      const [server] = await testDb.db
        .insert(servers)
        .values({ name: 'edge-1' })
        .returning();
      const [root] = await testDb.db.insert(domains).values({ name: 'example.com' }).returning();

      const [beta] = await testDb.db
        .insert(environments)
        .values({
          projectId,
          name: 'Бета-прод',
          kind: EnvironmentKind.Production,
          serverId: server!.id,
        })
        .returning();
      const [alpha] = await testDb.db
        .insert(environments)
        .values({
          projectId,
          name: 'Альфа-прод',
          kind: EnvironmentKind.Production,
          serverId: server!.id,
        })
        .returning();

      await testDb.db.insert(environmentDomains).values([
        { environmentId: alpha!.id, domainId: root!.id, name: 'www.example.com' },
        { environmentId: alpha!.id, domainId: root!.id, name: 'api.example.com' },
        { environmentId: beta!.id, domainId: root!.id, name: 'beta.example.com' },
      ]);

      const [item] = await repository.findVisible(subject());

      // Альфа раньше Беты; api раньше www.
      expect(item).toMatchObject({
        productionDomain: 'api.example.com',
        productionServerName: 'edge-1',
      });
    });

    it('при Infra Metadata отдаёт домен и прячет имя сервера', async () => {
      await testDb.db.insert(grants).values({
        subjectId,
        projectId,
        section: Section.Infrastructure,
        level: AccessLevel.Metadata,
        grantedBy,
      });

      const [server] = await testDb.db
        .insert(servers)
        .values({ name: 'edge-1' })
        .returning();
      const [root] = await testDb.db.insert(domains).values({ name: 'example.com' }).returning();
      const [prod] = await testDb.db
        .insert(environments)
        .values({
          projectId,
          name: 'Прод',
          kind: EnvironmentKind.Production,
          serverId: server!.id,
        })
        .returning();
      await testDb.db.insert(environmentDomains).values({
        environmentId: prod!.id,
        domainId: root!.id,
        name: 'example.com',
      });

      const [item] = await repository.findVisible(subject());

      expect(item).toMatchObject({
        productionDomain: 'example.com',
        productionServerName: null,
      });
    });

    it('сортирует проекты по имени', async () => {
      await testDb.db.insert(projects).values({ slug: 'beta', name: 'Бета' });
      await testDb.db.insert(projects).values({ slug: 'alpha', name: 'Альфа' });

      const visible = await repository.findVisible(subject({ isSuperadmin: true }));

      expect(visible.map((row) => row.name)).toEqual(['Альфа', 'Бета', 'Проект']);
    });
  });

  describe('create', () => {
    const admin = () => subject({ isSuperadmin: true });

    it('генерирует уникальный слаг при совпадении названий', async () => {
      const first = await repository.create(admin(), testDb.db, { name: 'Проект' });
      const second = await repository.create(admin(), testDb.db, { name: 'Проект' });

      expect(first.slug).not.toBe(second.slug);
    });

    it('ставит состояние «в разработке» по умолчанию', async () => {
      const created = await repository.create(admin(), testDb.db, { name: 'Новый' });

      expect(created.lifecycle).toBe(ProjectLifecycle.Development);
    });

    it('отказывает не-суперадмину', async () => {
      // Создавать проекты вправе только суперадмин (спека 4.4).
      await expect(
        repository.create(subject(), testDb.db, { name: 'Чужой' }),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });

    it('отказывает отозванному суперадмину', async () => {
      await expect(
        repository.create(subject({ isSuperadmin: true, isRevoked: true }), testDb.db, {
          name: 'Чужой',
        }),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });
  });

  describe('update', () => {
    it('без доступа бросает «не найдено»', async () => {
      await expect(
        repository.update(subject(), testDb.db, projectId, { name: 'Новое имя' }),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });

    it('на уровне чтения бросает «недостаточно прав»', async () => {
      await grant(AccessLevel.Read);

      await expect(
        repository.update(subject(), testDb.db, projectId, { name: 'Новое имя' }),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });

    it('на уровне записи меняет поля', async () => {
      await grant(AccessLevel.Write);

      const updated = await repository.update(subject(), testDb.db, projectId, {
        name: 'Новое имя',
      });

      expect(updated.name).toBe('Новое имя');
    });

    it('не меняет слаг', async () => {
      // Слаг задаётся один раз, чтобы ссылки не ломались (спека 4.4).
      await grant(AccessLevel.Write);

      const updated = await repository.update(subject(), testDb.db, projectId, {
        name: 'Совсем другое имя',
      });

      expect(updated.slug).toBe('proekt');
    });
  });
});
