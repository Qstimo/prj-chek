import { AccessLevel, RoadmapVersionState, Section, SubjectKind } from '@cairn/shared';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import { InsufficientLevelError, SectionNotVisibleError } from '../access/access.errors';
import type { RequestSubject } from '../access/access.types';
import { grants, projects, roadmapCheckpoints, subjects, users } from '../db/schema';
import { RoadmapRepository } from './roadmap.repository';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('репозиторий роадмапа', () => {
  let testDb: TestDatabase;
  let repository: RoadmapRepository;
  let projectId: string;
  let otherProjectId: string;
  let subjectId: string;
  let adminSubjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new RoadmapRepository(testDb.db, new AccessService(testDb.db));
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

  const member = (): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'user@cairn.local',
    isSuperadmin: false,
    isRevoked: false,
  });

  const admin = (): RequestSubject => ({
    id: adminSubjectId,
    kind: SubjectKind.User,
    label: 'admin@cairn.local',
    isSuperadmin: true,
    isRevoked: false,
  });

  async function grant(level: AccessLevel): Promise<void> {
    await testDb.db.insert(grants).values({
      subjectId,
      projectId,
      section: Section.Roadmap,
      level,
      grantedBy: adminUserId,
    });
  }

  async function createVersion(label = 'v1.0', target = projectId): Promise<string> {
    const created = await testDb.db.transaction((tx) =>
      repository.createVersion(admin(), tx, target, { label }),
    );

    return created.id;
  }

  describe('версии', () => {
    it('создаёт версии с растущей позицией', async () => {
      await createVersion('v1.0');
      const second = await testDb.db.transaction((tx) =>
        repository.createVersion(admin(), tx, projectId, { label: 'v2.0' }),
      );

      expect(second.position).toBe(2);
    });

    it('не допускает двух версий с одним обозначением в проекте', async () => {
      await createVersion('v1.0');

      // Именно ConflictException: сырое нарушение уникальности БД ушло бы клиенту как 500.
      await expect(createVersion('v1.0')).rejects.toBeInstanceOf(ConflictException);
    });

    it('не даёт переименовать версию в занятое обозначение', async () => {
      await createVersion('v1.0');
      const versionId = await createVersion('v2.0');

      await expect(
        testDb.db.transaction((tx) =>
          repository.updateVersion(admin(), tx, projectId, versionId, { label: 'v1.0' }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('правка версии без смены обозначения проходит', async () => {
      const versionId = await createVersion('v1.0');

      const updated = await testDb.db.transaction((tx) =>
        repository.updateVersion(admin(), tx, projectId, versionId, {
          label: 'v1.0',
          state: RoadmapVersionState.InProgress,
        }),
      );

      expect(updated.state).toBe(RoadmapVersionState.InProgress);
    });

    it('отказывает на уровне чтения', async () => {
      await grant(AccessLevel.Read);

      await expect(
        testDb.db.transaction((tx) =>
          repository.createVersion(member(), tx, projectId, { label: 'v1.0' }),
        ),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });

    it('удаление версии стирает её чекпоинты', async () => {
      const versionId = await createVersion();
      await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, { title: 'Пункт' }),
      );

      await testDb.db.transaction((tx) =>
        repository.removeVersion(admin(), tx, projectId, versionId),
      );

      expect(await testDb.db.select().from(roadmapCheckpoints)).toHaveLength(0);
    });

    it('не отдаёт версию через чужой проект', async () => {
      const versionId = await createVersion();

      await expect(
        testDb.db.transaction((tx) =>
          repository.updateVersion(admin(), tx, otherProjectId, versionId, { label: 'v9' }),
        ),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });

    it('сохраняет и отдаёт фактическую дату релиза', async () => {
      const version = await testDb.db.transaction((tx) =>
        repository.createVersion(admin(), tx, projectId, {
          label: 'v1',
          state: RoadmapVersionState.Released,
          releasedDate: '2026-09-01',
        }),
      );

      expect(version.releasedDate).toBe('2026-09-01');

      const roadmap = await repository.findForProject(admin(), projectId);
      expect(roadmap.versions[0]!.releasedDate).toBe('2026-09-01');
    });

    it('правит фактическую дату релиза', async () => {
      const version = await testDb.db.transaction((tx) =>
        repository.createVersion(admin(), tx, projectId, { label: 'v1' }),
      );

      const updated = await testDb.db.transaction((tx) =>
        repository.updateVersion(admin(), tx, projectId, version.id, {
          releasedDate: '2026-09-02',
        }),
      );

      expect(updated.releasedDate).toBe('2026-09-02');
    });
  });

  describe('роадмап и стадия', () => {
    it('метаданные содержат прогресс без формулировок', async () => {
      const versionId = await createVersion();
      await testDb.db.transaction(async (tx) => {
        await repository.createCheckpoint(admin(), tx, projectId, versionId, { title: 'Секрет' });
        const done = await repository.createCheckpoint(admin(), tx, projectId, versionId, {
          title: 'Готово',
        });
        await repository.updateCheckpoint(admin(), tx, projectId, versionId, done.id, {
          isDone: true,
        });
      });
      await grant(AccessLevel.Metadata);

      const roadmap = await repository.findForProject(member(), projectId);

      expect(roadmap.versions[0]!.progress).toEqual({ done: 1, total: 2 });
      expect(JSON.stringify(roadmap)).not.toContain('Секрет');
    });

    it('чтение отдаёт формулировки', async () => {
      const versionId = await createVersion();
      await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, { title: 'Виден' }),
      );
      await grant(AccessLevel.Read);

      const roadmap = await repository.findForProject(member(), projectId);

      expect(JSON.stringify(roadmap.versions[0])).toContain('Виден');
    });

    it('стадия — первая версия в работе', async () => {
      await createVersion('v1.0');
      const second = await createVersion('v2.0');
      await testDb.db.transaction((tx) =>
        repository.updateVersion(admin(), tx, projectId, second, {
          state: RoadmapVersionState.InProgress,
        }),
      );

      const roadmap = await repository.findForProject(admin(), projectId);

      expect(roadmap.stage).toEqual({ current: 2, total: 2 });
    });

    it('без версии в работе стадия — первая запланированная', async () => {
      const first = await createVersion('v1.0');
      await createVersion('v2.0');
      await testDb.db.transaction((tx) =>
        repository.updateVersion(admin(), tx, projectId, first, {
          state: RoadmapVersionState.Released,
        }),
      );

      const roadmap = await repository.findForProject(admin(), projectId);

      expect(roadmap.stage).toEqual({ current: 2, total: 2 });
    });

    it('все выпущены — стадия равна последней', async () => {
      const first = await createVersion('v1.0');
      await testDb.db.transaction((tx) =>
        repository.updateVersion(admin(), tx, projectId, first, {
          state: RoadmapVersionState.Released,
        }),
      );

      const roadmap = await repository.findForProject(admin(), projectId);

      expect(roadmap.stage).toEqual({ current: 1, total: 1 });
    });

    it('без версий стадия пуста', async () => {
      const roadmap = await repository.findForProject(admin(), projectId);

      expect(roadmap.stage).toEqual({ current: null, total: 0 });
    });

    it('скрывает секцию без выдачи', async () => {
      await expect(repository.findForProject(member(), projectId)).rejects.toBeInstanceOf(
        SectionNotVisibleError,
      );
    });
  });

  describe('публичная ссылка', () => {
    it('публикация выдаёт токен, повторная — конфликт', async () => {
      const token = await testDb.db.transaction((tx) => repository.publish(tx, projectId));

      expect(token.length).toBeGreaterThanOrEqual(32);
      await expect(
        testDb.db.transaction((tx) => repository.publish(tx, projectId)),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('публичный роадмап читается по токену с формулировками', async () => {
      const versionId = await createVersion();
      await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, { title: 'Публичный' }),
      );
      const token = await testDb.db.transaction((tx) => repository.publish(tx, projectId));

      const roadmap = await repository.publicRoadmap(token);

      expect(roadmap?.projectName).toBe('Проект');
      expect(JSON.stringify(roadmap)).toContain('Публичный');
    });

    it('мусорный токен и отключённая публикация неразличимы', async () => {
      expect(await repository.publicRoadmap('мусор')).toBeNull();

      const token = await testDb.db.transaction((tx) => repository.publish(tx, projectId));
      await testDb.db.transaction((tx) => repository.unpublish(tx, projectId));

      expect(await repository.publicRoadmap(token)).toBeNull();
    });

    it('отключение без публикации — «не найдено»', async () => {
      await expect(
        testDb.db.transaction((tx) => repository.unpublish(tx, projectId)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('находит действующий токен проекта', async () => {
      expect(await repository.findPublicLink(projectId)).toBeNull();

      const token = await testDb.db.transaction((tx) => repository.publish(tx, projectId));

      expect(await repository.findPublicLink(projectId)).toBe(token);
    });
  });

  describe('чекпоинты', () => {
    it('переключение признака меняет прогресс', async () => {
      const versionId = await createVersion();
      const checkpoint = await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, { title: 'Пункт' }),
      );

      await testDb.db.transaction((tx) =>
        repository.updateCheckpoint(admin(), tx, projectId, versionId, checkpoint.id, {
          isDone: true,
        }),
      );

      const roadmap = await repository.findForProject(admin(), projectId);
      expect(roadmap.versions[0]!.progress).toEqual({ done: 1, total: 1 });
    });

    it('не отдаёт чекпоинт через чужую версию', async () => {
      const versionId = await createVersion();
      const foreignVersion = await createVersion('v9', otherProjectId);
      const checkpoint = await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, { title: 'Пункт' }),
      );

      await expect(
        testDb.db.transaction((tx) =>
          repository.updateCheckpoint(admin(), tx, otherProjectId, foreignVersion, checkpoint.id, {
            isDone: true,
          }),
        ),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });
  });
});
