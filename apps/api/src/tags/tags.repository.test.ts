import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { InsufficientLevelError, SectionNotVisibleError } from '../access/access.errors';
import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { grants, projectTags, projects, subjects, tags, users } from '../db/schema';
import { TagsRepository } from './tags.repository';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('репозиторий тегов', () => {
  let testDb: TestDatabase;
  let repository: TagsRepository;
  let projectId: string;
  let otherProjectId: string;
  let subjectId: string;
  let adminSubjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new TagsRepository(testDb.db, new AccessService(testDb.db));
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
    adminSubjectId = adminSubject!.id;
    const [admin] = await testDb.db
      .insert(users)
      .values({
        subjectId: adminSubjectId,
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

  /** Субъект обычного пользователя. */
  function user(): RequestSubject {
    return {
      id: subjectId,
      kind: SubjectKind.User,
      label: 'user@cairn.local',
      isSuperadmin: false,
      isRevoked: false,
    };
  }

  /** Субъект суперадмина. */
  function admin(): RequestSubject {
    return {
      id: adminSubjectId,
      kind: SubjectKind.User,
      label: 'admin@cairn.local',
      isSuperadmin: true,
      isRevoked: false,
    };
  }

  /** Выдаёт пользователю уровень в секции «Инфо». */
  async function grantInfo(level: AccessLevel): Promise<void> {
    await testDb.db
      .insert(grants)
      .values({ subjectId, projectId, section: Section.Info, level, grantedBy: adminUserId });
  }

  describe('set', () => {
    it('заводит теги и связывает их с проектом', async () => {
      const result = await repository.set(admin(), testDb.db, projectId, ['Web', 'Продукт']);

      expect(result.map((tag) => tag.label)).toEqual(['Продукт', 'Web']);
      expect(await testDb.rowsOf(projectTags)).toHaveLength(2);
    });

    it('отдаёт набор по показываемому названию', async () => {
      // Порядка у набора нет, и единственный предсказуемый — по тому,
      // что видно: иначе чипы переставлялись бы от правки к правке.
      // Кириллица впереди латиницы — таков русский порядок в ICU.
      const result = await repository.set(admin(), testDb.db, projectId, ['Продукт', 'Web']);

      expect(result.map((tag) => tag.label)).toEqual(['Продукт', 'Web']);
    });

    it('переиспользует тег другого проекта, а не заводит второй', async () => {
      // Весь смысл реестра: «Web» у всех один, иначе фильтровать сводку
      // по нему было бы нечем.
      await repository.set(admin(), testDb.db, otherProjectId, ['Web']);
      await repository.set(admin(), testDb.db, projectId, ['Web']);

      expect(await testDb.rowsOf(tags)).toHaveLength(1);
      expect(await testDb.rowsOf(projectTags)).toHaveLength(2);
    });

    it('сводит названия, различимые только регистром, к одному тегу', async () => {
      await repository.set(admin(), testDb.db, otherProjectId, ['Web']);
      const result = await repository.set(admin(), testDb.db, projectId, ['WEB']);

      expect(await testDb.rowsOf(tags)).toHaveLength(1);
      // Название остаётся тем, под которым тег завели: правка чужого
      // проекта не должна переписывать то, что видно в соседнем.
      expect(result[0]?.label).toBe('Web');
    });

    it('снимает теги, которых нет в новом наборе', async () => {
      await repository.set(admin(), testDb.db, projectId, ['Web', 'Продукт']);
      const result = await repository.set(admin(), testDb.db, projectId, ['Продукт']);

      expect(result.map((tag) => tag.label)).toEqual(['Продукт']);
    });

    it('уносит из реестра тег, у которого не осталось ни одной связи', async () => {
      // Тег, который никому не приписан, не отвечает ни на один вопрос,
      // а в чипах фильтра занимал бы место пустой кнопкой.
      await repository.set(admin(), testDb.db, projectId, ['Web']);
      await repository.set(admin(), testDb.db, projectId, []);

      expect(await testDb.rowsOf(tags)).toEqual([]);
    });

    it('оставляет в реестре тег, который остался у другого проекта', async () => {
      await repository.set(admin(), testDb.db, otherProjectId, ['Web']);
      await repository.set(admin(), testDb.db, projectId, ['Web']);
      await repository.set(admin(), testDb.db, projectId, []);

      expect((await testDb.rowsOf(tags)).map((tag) => tag.label)).toEqual(['Web']);
    });

    it('требует уровень записи в «Инфо»', async () => {
      await grantInfo(AccessLevel.Read);

      await expect(repository.set(user(), testDb.db, projectId, ['Web'])).rejects.toThrow(
        InsufficientLevelError,
      );
    });

    it('без выдачи отвечает «не видно», а не «нельзя»', async () => {
      await expect(repository.set(user(), testDb.db, projectId, ['Web'])).rejects.toThrow(
        SectionNotVisibleError,
      );
    });

    it('не трогает чужой проект под видом своего', async () => {
      await grantInfo(AccessLevel.Write);

      await expect(repository.set(user(), testDb.db, otherProjectId, ['Web'])).rejects.toThrow(
        SectionNotVisibleError,
      );
    });

    it('у несуществующего проекта отвечает «не видно», а не ошибкой ключа', async () => {
      await expect(
        repository.set(admin(), testDb.db, '11111111-1111-1111-1111-111111111111', ['Web']),
      ).rejects.toThrow(SectionNotVisibleError);
    });
  });

  describe('права роли приложения', () => {
    it('роль приложения правит реестр и связи', async () => {
      // Гранты на новые таблицы drizzle-kit не выдаёт, и без отдельной
      // миграции приложение упало бы отказом в правах на первом же
      // запросе сводки. Фикстура их не дублирует намеренно.
      const [project] = await testDb.appDb.select().from(projects).limit(1);
      const [tag] = await testDb.appDb
        .insert(tags)
        .values({ slug: 'web', label: 'Web' })
        .returning();

      await testDb.appDb.insert(projectTags).values({
        projectId: project!.id,
        tagId: tag!.id,
      });

      await expect(testDb.appDb.delete(projectTags)).resolves.toBeDefined();
      await expect(testDb.appDb.delete(tags)).resolves.toBeDefined();
    });
  });

  describe('forProjects', () => {
    it('собирает теги набора проектов одним запросом', async () => {
      await repository.set(admin(), testDb.db, projectId, ['Web']);
      await repository.set(admin(), testDb.db, otherProjectId, ['Продукт', 'Web']);

      const map = await repository.forProjects(testDb.db, [projectId, otherProjectId]);

      expect(map.get(projectId)?.map((tag) => tag.label)).toEqual(['Web']);
      expect(map.get(otherProjectId)?.map((tag) => tag.label)).toEqual(['Продукт', 'Web']);
    });

    it('на пустом списке проектов не спрашивает базу', async () => {
      expect(await repository.forProjects(testDb.db, [])).toEqual(new Map());
    });
  });

  describe('vocabulary', () => {
    it('отдаёт теги видимых проектов по алфавиту', async () => {
      await repository.set(admin(), testDb.db, projectId, ['Продукт', 'Web']);

      expect((await repository.vocabulary(admin())).map((tag) => tag.label)).toEqual([
        'Продукт',
        'Web',
      ]);
    });

    it('не раскрывает теги проекта, паспорт которого не виден', async () => {
      // Проект, видимый только через роадмап, не обязан раскрывать свои
      // метки: теги — поле паспорта, и гейт у них тот же.
      await repository.set(admin(), testDb.db, projectId, ['Web']);
      await testDb.db.insert(grants).values({
        subjectId,
        projectId,
        section: Section.Roadmap,
        level: AccessLevel.Read,
        grantedBy: adminUserId,
      });

      expect(await repository.vocabulary(user())).toEqual([]);
    });

    it('отдаёт тег, если паспорт виден хотя бы на уровне метаданных', async () => {
      await repository.set(admin(), testDb.db, projectId, ['Web']);
      await grantInfo(AccessLevel.Metadata);

      expect((await repository.vocabulary(user())).map((tag) => tag.label)).toEqual(['Web']);
    });

    it('не повторяет тег, приписанный нескольким проектам', async () => {
      await repository.set(admin(), testDb.db, projectId, ['Web']);
      await repository.set(admin(), testDb.db, otherProjectId, ['Web']);

      expect(await repository.vocabulary(admin())).toHaveLength(1);
    });
  });
});
