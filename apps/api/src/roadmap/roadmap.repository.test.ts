import {
  AccessLevel,
  CARRY_OVER_NEEDS_LABEL,
  EnvironmentKind,
  PlatformKind,
  PlatformReleaseState,
  RoadmapVersionState,
  Section,
  SubjectKind,
  type RoadmapVersionDetail,
} from '@cairn/shared';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import { InsufficientLevelError, SectionNotVisibleError } from '../access/access.errors';
import type { RequestSubject } from '../access/access.types';
import {
  checkpointPlatforms,
  environments,
  grants,
  projectPlatforms,
  projects,
  roadmapCheckpoints,
  roadmapReportPublicLinks,
  subjects,
  users,
  versionPlatformReleases,
} from '../db/schema';
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

  /**
   * Платформа вставкой: репозиторий платформ потребовал бы «Инфо»,
   * которого у субъекта этих тестов нет.
   *
   * Позиция параметром: выборка сортирует по ней, и одинаковая позиция
   * превратила бы проверку порядка в проверку времени создания.
   */
  async function createPlatform(
    name: string,
    kind = PlatformKind.Server,
    position = 1,
    target = projectId,
  ): Promise<string> {
    const [created] = await testDb.db
      .insert(projectPlatforms)
      .values({ projectId: target, name, kind, position })
      .returning();

    return created!.id;
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

    it('отвергает дату релиза у версии проекта с платформами', async () => {
      // Дизайн релизов, раздел 6: дата версии вычисляется из выпусков,
      // и запись в колонку завела бы вторую правду после первой.
      const versionId = await createVersion('v1');
      await createPlatform('API');

      await expect(
        testDb.db.transaction((tx) =>
          repository.updateVersion(admin(), tx, projectId, versionId, {
            releasedDate: '2026-09-01',
          }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('отвергает и обнуление даты релиза у проекта с платформами', async () => {
      // Отвергается присутствие ключа, а не значение: `null` — такая же
      // запись в колонку, как и дата.
      const versionId = await createVersion('v1');
      await createPlatform('API');

      await expect(
        testDb.db.transaction((tx) =>
          repository.updateVersion(admin(), tx, projectId, versionId, { releasedDate: null }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('отвергает дату релиза и при создании версии', async () => {
      // Вторая правда при заведении версии ничем не лучше, чем при правке.
      await createPlatform('API');

      await expect(
        testDb.db.transaction((tx) =>
          repository.createVersion(admin(), tx, projectId, {
            label: 'v1',
            releasedDate: '2026-09-01',
          }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('правка остальных полей при платформах проходит', async () => {
      // Проверка смотрит на ключ даты, а не на сам факт платформ:
      // иначе роадмап проекта с платформами стал бы неправимым.
      const versionId = await createVersion('v1');
      await createPlatform('API');

      const updated = await testDb.db.transaction((tx) =>
        repository.updateVersion(admin(), tx, projectId, versionId, {
          state: RoadmapVersionState.Released,
        }),
      );

      expect(updated.state).toBe(RoadmapVersionState.Released);
    });

    it('платформа чужого проекта дату релиза не запирает', async () => {
      // Запрет принадлежит проекту версии: платформы соседа о ней
      // ничего не говорят.
      const versionId = await createVersion('v1');
      await createPlatform('API', PlatformKind.Server, 1, otherProjectId);

      const updated = await testDb.db.transaction((tx) =>
        repository.updateVersion(admin(), tx, projectId, versionId, {
          releasedDate: '2026-09-02',
        }),
      );

      expect(updated.releasedDate).toBe('2026-09-02');
    });
  });

  describe('обозначения версий', () => {
    it('отдаёт обозначения и позиции по порядку', async () => {
      await createVersion('v1.1');
      await createVersion('v1.2');

      expect(await repository.labelsForProject(admin(), projectId)).toEqual([
        { label: 'v1.1', position: 1 },
        { label: 'v1.2', position: 2 },
      ]);
    });

    it('хватает уровня метаданных: обозначения видны и на нём', async () => {
      // ТЗ 4.3: обозначение версии — метаданные роадмапа, а не его
      // содержимое.
      await createVersion('v1.1');
      await createVersion('v1.2');
      await grant(AccessLevel.Metadata);

      await expect(repository.labelsForProject(member(), projectId)).resolves.toHaveLength(2);
    });

    it('без выдачи на роадмап проект не раскрывается', async () => {
      // Отсутствие доступа — 404, а не 403.
      await createVersion('v1.1');

      await expect(repository.labelsForProject(member(), projectId)).rejects.toBeInstanceOf(
        SectionNotVisibleError,
      );
    });

    it('версий чужого проекта не отдаёт', async () => {
      await createVersion('v1.1');

      expect(await repository.labelsForProject(admin(), otherProjectId)).toEqual([]);
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

    it('сохраняет ссылку на задачу и отдаёт её при чтении', async () => {
      const versionId = await createVersion();
      await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, {
          title: 'Со ссылкой',
          url: 'https://tracker.example.com/TASK-17',
        }),
      );
      await grant(AccessLevel.Read);

      const roadmap = await repository.findForProject(member(), projectId);

      const version = roadmap.versions[0] as RoadmapVersionDetail;

      expect(version.checkpoints[0]!.url).toBe('https://tracker.example.com/TASK-17');
    });

    it('по просьбе без ссылок не отдаёт их и на уровне чтения', async () => {
      // Этим пользуется путь агентов MCP: адрес внутреннего трекера с
      // номером задачи в контексте модели не нужен.
      const versionId = await createVersion();
      await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, {
          title: 'Со ссылкой',
          url: 'https://tracker.example.com/TASK-17',
        }),
      );
      await grant(AccessLevel.Read);

      const roadmap = await repository.findForProject(member(), projectId, { withLinks: false });

      const version = roadmap.versions[0] as RoadmapVersionDetail;

      expect(version.checkpoints[0]).not.toHaveProperty('url');
      expect(JSON.stringify(roadmap)).not.toContain('tracker.example.com');
    });

    it('чекпоинт без ссылки отдаёт её пустой', async () => {
      const versionId = await createVersion();
      await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, { title: 'Без ссылки' }),
      );
      await grant(AccessLevel.Read);

      const roadmap = await repository.findForProject(member(), projectId);

      const version = roadmap.versions[0] as RoadmapVersionDetail;

      expect(version.checkpoints[0]!.url).toBeNull();
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
      const token = await testDb.db.transaction((tx) => repository.publish(admin(), tx, projectId));

      expect(token.length).toBeGreaterThanOrEqual(32);
      await expect(
        testDb.db.transaction((tx) => repository.publish(admin(), tx, projectId)),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('публичный роадмап читается по токену с формулировками', async () => {
      const versionId = await createVersion();
      await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, { title: 'Публичный' }),
      );
      const token = await testDb.db.transaction((tx) => repository.publish(admin(), tx, projectId));

      const roadmap = await repository.publicRoadmap(token);

      expect(roadmap?.projectName).toBe('Проект');
      expect(JSON.stringify(roadmap)).toContain('Публичный');
    });

    it('публичная выдача не содержит ссылок на задачи', async () => {
      // Страница открыта без авторизации: адрес внутреннего трекера вместе
      // с номером задачи наружу уходить не должен.
      const versionId = await createVersion();
      await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, {
          title: 'Публичный',
          url: 'https://tracker.example.com/TASK-17',
        }),
      );
      const token = await testDb.db.transaction((tx) => repository.publish(admin(), tx, projectId));

      const roadmap = await repository.publicRoadmap(token);

      expect(roadmap?.versions[0]?.checkpoints[0]).not.toHaveProperty('url');
      expect(JSON.stringify(roadmap)).not.toContain('tracker.example.com');
    });

    it('мусорный токен и отключённая публикация неразличимы', async () => {
      expect(await repository.publicRoadmap('мусор')).toBeNull();

      const token = await testDb.db.transaction((tx) => repository.publish(admin(), tx, projectId));
      await testDb.db.transaction((tx) => repository.unpublish(admin(), tx, projectId));

      expect(await repository.publicRoadmap(token)).toBeNull();
    });

    it('отключение без публикации — «не найдено»', async () => {
      await expect(
        testDb.db.transaction((tx) => repository.unpublish(admin(), tx, projectId)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('находит действующий токен проекта', async () => {
      expect(await repository.findPublicLink(admin(), projectId)).toBeNull();

      const token = await testDb.db.transaction((tx) => repository.publish(admin(), tx, projectId));

      expect(await repository.findPublicLink(admin(), projectId)).toBe(token);
    });

    it('скрывает ссылку без выдачи и отказывает ниже уровня', async () => {
      // Право проверяет выборка, а не контроллер (ТЗ 4.1): без выдачи
      // секция не существует, с одними метаданными — уровня не хватает.
      await expect(repository.findPublicLink(member(), projectId)).rejects.toBeInstanceOf(
        SectionNotVisibleError,
      );

      await grant(AccessLevel.Metadata);

      await expect(repository.findPublicLink(member(), projectId)).rejects.toBeInstanceOf(
        InsufficientLevelError,
      );
    });

    it('публикация и отключение требуют записи', async () => {
      await grant(AccessLevel.Read);

      await expect(
        testDb.db.transaction((tx) => repository.publish(member(), tx, projectId)),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
      await expect(
        testDb.db.transaction((tx) => repository.unpublish(member(), tx, projectId)),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
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

  describe('перенос чекпоинта', () => {
    /** Чекпоинт в указанной версии: перенос всегда начинается с него. */
    async function createCheckpoint(versionId: string, title = 'Оплата'): Promise<string> {
      const created = await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, { title }),
      );

      return created.id;
    }

    function carryOver(
      versionId: string,
      checkpointId: string,
      input: Parameters<typeof repository.carryOverCheckpoint>[5] = {},
      subject = admin(),
    ) {
      return testDb.db.transaction((tx) =>
        repository.carryOverCheckpoint(subject, tx, projectId, versionId, checkpointId, input),
      );
    }

    it('переносит в указанную версию', async () => {
      const from = await createVersion('v1.2');
      const to = await createVersion('v1.3');
      const checkpointId = await createCheckpoint(from);

      const carried = await carryOver(from, checkpointId, { targetVersionId: to });

      expect(carried.checkpoint.versionId).toBe(to);
      expect(carried.toLabel).toBe('v1.3');
      expect(carried.versionCreated).toBe(false);
    });

    it('без тела едет в следующую открытую версию', async () => {
      // То же правило, что у стадии: кнопка переноса и полоса версий
      // обязаны называть одну и ту же текущую версию.
      const from = await createVersion('v1.2');
      const to = await createVersion('v1.3');
      await testDb.db.transaction((tx) =>
        repository.updateVersion(admin(), tx, projectId, from, {
          state: RoadmapVersionState.Released,
        }),
      );
      const checkpointId = await createCheckpoint(from);

      const carried = await carryOver(from, checkpointId);

      expect(carried.checkpoint.versionId).toBe(to);
      expect(carried.versionCreated).toBe(false);
    });

    it('создаёт версию по обозначению', async () => {
      const from = await createVersion('v1.2');
      const checkpointId = await createCheckpoint(from);

      const carried = await carryOver(from, checkpointId, { newVersionLabel: 'v1.3' });

      expect(carried.versionCreated).toBe(true);
      expect(carried.toLabel).toBe('v1.3');

      const roadmap = await repository.findForProject(admin(), projectId);
      expect(roadmap.versions.map((version) => version.label)).toEqual(['v1.2', 'v1.3']);
    });

    it('занятое обозначение новой версии — конфликт', async () => {
      const from = await createVersion('v1.2');
      await createVersion('v1.3');
      const checkpointId = await createCheckpoint(from);

      await expect(
        carryOver(from, checkpointId, { newVersionLabel: 'v1.3' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('без открытой версии и без обозначения — различимый конфликт', async () => {
      const from = await createVersion('v1.2');
      await testDb.db.transaction((tx) =>
        repository.updateVersion(admin(), tx, projectId, from, {
          state: RoadmapVersionState.Released,
        }),
      );
      const checkpointId = await createCheckpoint(from);

      // Код, а не разбор текста: по нему интерфейс спрашивает обозначение.
      await expect(carryOver(from, checkpointId)).rejects.toMatchObject({
        response: { code: CARRY_OVER_NEEDS_LABEL },
      });
    });

    it('чужая целевая версия — «не видно», а не «нельзя»', async () => {
      const from = await createVersion('v1.2');
      const foreign = await createVersion('v9', otherProjectId);
      const checkpointId = await createCheckpoint(from);

      await expect(
        carryOver(from, checkpointId, { targetVersionId: foreign }),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });

    it('перенос в ту же версию — конфликт', async () => {
      const from = await createVersion('v1.2');
      const checkpointId = await createCheckpoint(from);

      await expect(
        carryOver(from, checkpointId, { targetVersionId: from }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('становится последним в целевой версии, а не вторым жильцом', async () => {
      // Позиции правятся без перенумерации и без уникальности: прежняя
      // позиция привела бы чекпоинт на занятое место.
      const from = await createVersion('v1.2');
      const to = await createVersion('v1.3');
      await createCheckpoint(to, 'Первый');
      await createCheckpoint(to, 'Второй');
      const checkpointId = await createCheckpoint(from, 'Приезжий');

      const carried = await carryOver(from, checkpointId, { targetVersionId: to });

      expect(carried.checkpoint.position).toBe(3);
    });

    it('помнит версию, из которой приехал', async () => {
      // Отчёту нужна пометка «перенесено в v1.3»: другого следа в
      // версии-источнике не остаётся.
      const from = await createVersion('v1.2');
      const to = await createVersion('v1.3');
      const checkpointId = await createCheckpoint(from);

      await carryOver(from, checkpointId, { targetVersionId: to });

      const [row] = await testDb.db
        .select()
        .from(roadmapCheckpoints)
        .where(eq(roadmapCheckpoints.id, checkpointId));

      expect(row?.carriedFromVersionId).toBe(from);
    });

    it('теги платформ переезжают вместе с чекпоинтом', async () => {
      await grant(AccessLevel.Read);
      const apiId = await createPlatform('API');
      const from = await createVersion('v1.2');
      const to = await createVersion('v1.3');
      const created = await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, from, {
          title: 'Оплата',
          platformIds: [apiId],
        }),
      );

      const carried = await carryOver(from, created.id, { targetVersionId: to });

      expect(carried.checkpoint.platformIds).toEqual([apiId]);
      expect(await testDb.rowsOf(checkpointPlatforms)).toHaveLength(1);
    });

    it('возвращает обозначения «откуда» и «куда» для журнала', async () => {
      const from = await createVersion('v1.2');
      const to = await createVersion('v1.3');
      const checkpointId = await createCheckpoint(from);

      const carried = await carryOver(from, checkpointId, { targetVersionId: to });

      expect(carried).toMatchObject({ fromLabel: 'v1.2', toLabel: 'v1.3' });
    });

    it('переносит прогресс вместе с чекпоинтом', async () => {
      // Прогресс вычисляется, не хранится: после переноса незакрытый
      // чекпоинт считается у получателя, а не у источника.
      const from = await createVersion('v1.2');
      const to = await createVersion('v1.3');
      const checkpointId = await createCheckpoint(from);

      await carryOver(from, checkpointId, { targetVersionId: to });

      const roadmap = await repository.findForProject(admin(), projectId);

      expect(roadmap.versions[0]).toMatchObject({ label: 'v1.2', unfinished: 0 });
      expect(roadmap.versions[1]).toMatchObject({ label: 'v1.3', unfinished: 1 });
    });

    it('требует уровня записи', async () => {
      const from = await createVersion('v1.2');
      const to = await createVersion('v1.3');
      const checkpointId = await createCheckpoint(from);
      await grant(AccessLevel.Read);

      await expect(
        carryOver(from, checkpointId, { targetVersionId: to }, member()),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });

    it('не отдаёт чекпоинт через чужую исходную версию', async () => {
      const from = await createVersion('v1.2');
      const to = await createVersion('v1.3');
      const checkpointId = await createCheckpoint(from);

      // Исходная версия — чужая: перенос не должен её находить.
      await expect(
        testDb.db.transaction((tx) =>
          repository.carryOverCheckpoint(admin(), tx, otherProjectId, from, checkpointId, {
            targetVersionId: to,
          }),
        ),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });

    it('удаление версии-источника гасит пометку, а не запирает удаление', async () => {
      const from = await createVersion('v1.2');
      const to = await createVersion('v1.3');
      const checkpointId = await createCheckpoint(from);
      await carryOver(from, checkpointId, { targetVersionId: to });

      await testDb.db.transaction((tx) => repository.removeVersion(admin(), tx, projectId, from));

      const [row] = await testDb.db
        .select()
        .from(roadmapCheckpoints)
        .where(eq(roadmapCheckpoints.id, checkpointId));

      expect(row?.carriedFromVersionId).toBeNull();
    });
  });

  describe('расхождение «выпущено, но не закрыто»', () => {
    it('помечает выпущенную версию с незакрытыми чекпоинтами', async () => {
      // Отказа нет: выпуск разрешён, расхождение лишь помечается.
      const versionId = await createVersion('v1.2');
      await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, { title: 'Оплата' }),
      );
      await testDb.db.transaction((tx) =>
        repository.updateVersion(admin(), tx, projectId, versionId, {
          state: RoadmapVersionState.Released,
        }),
      );

      const roadmap = await repository.findForProject(admin(), projectId);

      expect(roadmap.versions[0]).toMatchObject({ unfinished: 1, hasUnfinishedOnRelease: true });
    });

    it('признак виден на уровне метаданных', async () => {
      await grant(AccessLevel.Metadata);
      const versionId = await createVersion('v1.2');
      await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, { title: 'Секрет' }),
      );
      await testDb.db.transaction((tx) =>
        repository.updateVersion(admin(), tx, projectId, versionId, {
          state: RoadmapVersionState.Released,
        }),
      );

      const roadmap = await repository.findForProject(member(), projectId);

      expect(roadmap.versions[0]?.hasUnfinishedOnRelease).toBe(true);
      expect(JSON.stringify(roadmap)).not.toContain('Секрет');
    });

    it('признак доезжает до публичной выдачи', async () => {
      const versionId = await createVersion('v1.2');
      await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, { title: 'Оплата' }),
      );
      await testDb.db.transaction((tx) =>
        repository.updateVersion(admin(), tx, projectId, versionId, {
          state: RoadmapVersionState.Released,
        }),
      );
      const token = await testDb.db.transaction((tx) => repository.publish(admin(), tx, projectId));

      const roadmap = await repository.publicRoadmap(token);

      expect(roadmap?.versions[0]?.hasUnfinishedOnRelease).toBe(true);
    });
  });

  describe('сводка релизов', () => {
    it('отдаёт сводку рядом с версиями', async () => {
      await grant(AccessLevel.Read);
      await createPlatform('API', PlatformKind.Server, 1);
      await createPlatform('App Store', PlatformKind.Store, 2);

      const roadmap = await repository.findForProject(member(), projectId);

      expect(roadmap.summary.map((row) => row.platform.name)).toEqual(['API', 'App Store']);
    });

    it('отдаёт сводку и на уровне метаданных', async () => {
      // Обозначения версий и даты метаданными и являются; формулировок
      // чекпоинтов в сводке нет.
      await grant(AccessLevel.Metadata);
      await createPlatform('API');

      const roadmap = await repository.findForProject(member(), projectId);

      expect(roadmap.summary).toHaveLength(1);
    });

    it('показывает выпуск в сводке', async () => {
      await grant(AccessLevel.Read);
      const platformId = await createPlatform('API');
      const versionId = await createVersion('v1.2');
      await testDb.db.insert(versionPlatformReleases).values({
        versionId,
        platformId,
        state: PlatformReleaseState.Released,
        releasedDate: '2026-03-12',
      });

      const roadmap = await repository.findForProject(member(), projectId);

      expect(roadmap.summary[0]?.released).toMatchObject({
        versionLabel: 'v1.2',
        date: '2026-03-12',
      });
    });

    it('отдаёт сводку в публичной выдаче, без ссылок на задачи', async () => {
      // Чекпоинт со ссылкой обязателен: без него `checkpoints[0]` —
      // `undefined`, и проверка прошла бы при любой реализации.
      await createPlatform('API');
      const versionId = await createVersion('v1.0');
      await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, {
          title: 'Оплата',
          url: 'https://tracker.example.com/TASK-1',
        }),
      );
      const token = await testDb.db.transaction((tx) => repository.publish(admin(), tx, projectId));

      const roadmap = await repository.publicRoadmap(token);
      const checkpoint = roadmap?.versions[0]?.checkpoints[0];

      expect(roadmap?.summary).toHaveLength(1);
      expect(checkpoint?.title).toBe('Оплата');
      expect(checkpoint).not.toHaveProperty('url');
    });

    it('версия уровня чтения сохраняет чекпоинты и выпуски', async () => {
      // Страховка от тихой деградации union: проекция, забывшая
      // `releases`, провалилась бы в ветку метаданных и потеряла
      // чекпоинты вместо ошибки.
      await grant(AccessLevel.Read);
      const versionId = await createVersion('v1.0');
      await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, { title: 'Оплата' }),
      );

      const roadmap = await repository.findForProject(member(), projectId);

      expect(roadmap.versions[0]).toHaveProperty('checkpoints');
      expect(roadmap.versions[0]).toHaveProperty('releases');
    });

    it('отдаёт теги чекпоинта по порядку платформ', async () => {
      await grant(AccessLevel.Read);
      const webId = await createPlatform('Веб', PlatformKind.Server, 2);
      const apiId = await createPlatform('API', PlatformKind.Server, 1);
      const versionId = await createVersion('v1.0');
      const checkpoint = await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, { title: 'Оплата' }),
      );
      await testDb.db
        .insert(checkpointPlatforms)
        .values([
          { checkpointId: checkpoint.id, platformId: webId },
          { checkpointId: checkpoint.id, platformId: apiId },
        ]);

      const roadmap = await repository.findForProject(member(), projectId);
      const detail = roadmap.versions[0] as RoadmapVersionDetail;

      expect(detail.checkpoints[0]?.platformIds).toEqual([apiId, webId]);
    });
  });

  describe('выпуски платформ', () => {
    it('ставит выпуск и переставляет его той же ручкой', async () => {
      // Выпуск — не отдельная вещь со своим адресом, а значение в клетке
      // «версия × платформа»: повторный вызов меняет её, а не плодит вторую.
      const versionId = await createVersion('v1.0');
      const apiId = await createPlatform('API');

      await testDb.db.transaction((tx) =>
        repository.setRelease(admin(), tx, projectId, versionId, apiId, {
          state: PlatformReleaseState.OnTest,
        }),
      );
      await testDb.db.transaction((tx) =>
        repository.setRelease(admin(), tx, projectId, versionId, apiId, {
          state: PlatformReleaseState.Released,
          releasedDate: '2026-03-12',
        }),
      );

      const releases = await testDb.rowsOf(versionPlatformReleases);

      expect(releases).toHaveLength(1);
      expect(releases[0]?.state).toBe(PlatformReleaseState.Released);
      expect(releases[0]?.releasedDate).toBe('2026-03-12');
    });

    it('не присланные поля обнуляет, а не оставляет прежними', async () => {
      // Иначе переход «выпущена 12.03 → на тесте» сохранил бы дату релиза,
      // и PUT перестал бы быть заменой значения в клетке.
      const versionId = await createVersion('v1.0');
      const apiId = await createPlatform('API');

      await testDb.db.transaction((tx) =>
        repository.setRelease(admin(), tx, projectId, versionId, apiId, {
          state: PlatformReleaseState.Released,
          releasedDate: '2026-03-12',
          buildLabel: '1.0 (7)',
        }),
      );
      await testDb.db.transaction((tx) =>
        repository.setRelease(admin(), tx, projectId, versionId, apiId, {
          state: PlatformReleaseState.OnTest,
        }),
      );

      const [release] = await testDb.rowsOf(versionPlatformReleases);

      expect(release?.releasedDate).toBeNull();
      expect(release?.buildLabel).toBeNull();
    });

    it('не принимает дату выхода у выпуска «в пути»', async () => {
      // Иначе дата обещания уедет в сводку релизов наравне с датой
      // настоящего выхода, и сводка перестанет их различать.
      const versionId = await createVersion('v1.0');
      const storeId = await createPlatform('App Store', PlatformKind.Store);

      await expect(
        testDb.db.transaction((tx) =>
          repository.setRelease(admin(), tx, projectId, versionId, storeId, {
            state: PlatformReleaseState.InReview,
            releasedDate: '2026-03-12',
          }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('пустую дату у выпуска «в пути» принимает', async () => {
      // Отвергается дата, а не ключ: `null` — это «даты нет», и оно
      // допустимо при любом состоянии.
      const versionId = await createVersion('v1.0');
      const apiId = await createPlatform('API');

      const set = await testDb.db.transaction((tx) =>
        repository.setRelease(admin(), tx, projectId, versionId, apiId, {
          state: PlatformReleaseState.OnTest,
          releasedDate: null,
        }),
      );

      expect(set.releasedDate).toBeNull();
    });

    it('не ставит модерацию серверной платформе', async () => {
      const versionId = await createVersion('v1.0');
      const apiId = await createPlatform('API');

      await expect(
        testDb.db.transaction((tx) =>
          repository.setRelease(admin(), tx, projectId, versionId, apiId, {
            state: PlatformReleaseState.InReview,
          }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('не видит платформу чужого проекта', async () => {
      const versionId = await createVersion('v1.0');
      const foreign = await createPlatform('API', PlatformKind.Server, 1, otherProjectId);

      await expect(
        testDb.db.transaction((tx) =>
          repository.setRelease(admin(), tx, projectId, versionId, foreign, {
            state: PlatformReleaseState.OnTest,
          }),
        ),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });

    it('возвращает имя платформы и обозначение версии для журнала', async () => {
      // Служба их не достаёт сама: вызов репозитория платформ потребовал
      // бы доступа к «Инфо», которого у подрядчика с записью в роадмап нет.
      const versionId = await createVersion('v1.0');
      const apiId = await createPlatform('API');

      const set = await testDb.db.transaction((tx) =>
        repository.setRelease(admin(), tx, projectId, versionId, apiId, {
          state: PlatformReleaseState.OnTest,
        }),
      );

      expect(set).toMatchObject({ platformName: 'API', versionLabel: 'v1.0' });
    });

    it('снятие возвращает платформу «как у версии» и терпит отсутствие строки', async () => {
      const versionId = await createVersion('v1.0');
      const apiId = await createPlatform('API');

      await testDb.db.transaction((tx) =>
        repository.setRelease(admin(), tx, projectId, versionId, apiId, {
          state: PlatformReleaseState.OnTest,
        }),
      );
      await testDb.db.transaction((tx) =>
        repository.clearRelease(admin(), tx, projectId, versionId, apiId),
      );

      expect(await testDb.rowsOf(versionPlatformReleases)).toHaveLength(0);

      // Ручка идемпотентна: «как у версии» и до, и после вызова.
      const repeated = await testDb.db.transaction((tx) =>
        repository.clearRelease(admin(), tx, projectId, versionId, apiId),
      );

      expect(repeated).toMatchObject({ platformName: 'API', versionLabel: 'v1.0' });
      expect(await testDb.rowsOf(versionPlatformReleases)).toHaveLength(0);
    });
  });

  describe('теги платформ у чекпоинтов', () => {
    it('ставит теги при создании и заменяет при правке', async () => {
      await grant(AccessLevel.Read);
      const versionId = await createVersion('v1.0');
      const iosId = await createPlatform('App Store', PlatformKind.Store, 1);
      const androidId = await createPlatform('Google Play', PlatformKind.Store, 2);

      const created = await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, {
          title: 'Вход по телефону',
          platformIds: [iosId, androidId],
        }),
      );

      await testDb.db.transaction((tx) =>
        repository.updateCheckpoint(admin(), tx, projectId, versionId, created.id, {
          platformIds: [iosId],
        }),
      );

      const roadmap = await repository.findForProject(member(), projectId);
      const detail = roadmap.versions[0] as RoadmapVersionDetail;

      expect(detail.checkpoints[0]?.platformIds).toEqual([iosId]);
    });

    it('пустой набор тегов снимает все', async () => {
      const versionId = await createVersion('v1.0');
      const iosId = await createPlatform('App Store', PlatformKind.Store);
      const created = await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, {
          title: 'Оплата',
          platformIds: [iosId],
        }),
      );

      await testDb.db.transaction((tx) =>
        repository.updateCheckpoint(admin(), tx, projectId, versionId, created.id, {
          platformIds: [],
        }),
      );

      expect(await testDb.rowsOf(checkpointPlatforms)).toHaveLength(0);
    });

    it('правка без тегов их не трогает', async () => {
      // Ровно так переключается галочка «закрыт»: буквальная замена
      // набора снесла бы теги при каждом щелчке.
      const versionId = await createVersion('v1.0');
      const iosId = await createPlatform('App Store', PlatformKind.Store);
      const created = await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, {
          title: 'Оплата',
          platformIds: [iosId],
        }),
      );

      await testDb.db.transaction((tx) =>
        repository.updateCheckpoint(admin(), tx, projectId, versionId, created.id, {
          isDone: true,
        }),
      );

      expect(await testDb.rowsOf(checkpointPlatforms)).toHaveLength(1);
    });

    it('не ставит тег платформы чужого проекта', async () => {
      const versionId = await createVersion('v1.0');
      const foreign = await createPlatform('API', PlatformKind.Server, 1, otherProjectId);

      await expect(
        testDb.db.transaction((tx) =>
          repository.createCheckpoint(admin(), tx, projectId, versionId, {
            title: 'Оплата',
            platformIds: [foreign],
          }),
        ),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });

    it('удаление версии уносит выпуски и теги её чекпоинтов', async () => {
      const versionId = await createVersion('v1.0');
      const apiId = await createPlatform('API');
      await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, {
          title: 'Оплата',
          platformIds: [apiId],
        }),
      );
      await testDb.db.transaction((tx) =>
        repository.setRelease(admin(), tx, projectId, versionId, apiId, {
          state: PlatformReleaseState.OnTest,
        }),
      );

      await testDb.db.transaction((tx) =>
        repository.removeVersion(admin(), tx, projectId, versionId),
      );

      expect(await testDb.rowsOf(versionPlatformReleases)).toHaveLength(0);
      expect(await testDb.rowsOf(checkpointPlatforms)).toHaveLength(0);
    });

    it('удаление чекпоинта уносит его теги', async () => {
      const versionId = await createVersion('v1.0');
      const apiId = await createPlatform('API');
      const created = await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, {
          title: 'Оплата',
          platformIds: [apiId],
        }),
      );

      await testDb.db.transaction((tx) =>
        repository.removeCheckpoint(admin(), tx, projectId, versionId, created.id),
      );

      expect(await testDb.rowsOf(checkpointPlatforms)).toHaveLength(0);
    });
  });

  describe('ответы чекпоинта', () => {
    it('возвращает теги вместе с созданным и правленым чекпоинтом', async () => {
      // Ответы ручек собираются литералом, и без тегов в строке
      // контроллеру было бы нечего в них положить.
      const versionId = await createVersion('v1.0');
      const iosId = await createPlatform('App Store', PlatformKind.Store);

      const created = await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, {
          title: 'Вход по телефону',
          platformIds: [iosId],
        }),
      );

      expect(created.platformIds).toEqual([iosId]);

      const updated = await testDb.db.transaction((tx) =>
        repository.updateCheckpoint(admin(), tx, projectId, versionId, created.id, {
          platformIds: [],
        }),
      );

      expect(updated.platformIds).toEqual([]);
    });

    it('в ответе правки без тегов отдаёт текущий набор, а не присланный', async () => {
      const versionId = await createVersion('v1.0');
      const iosId = await createPlatform('App Store', PlatformKind.Store);
      const created = await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, {
          title: 'Оплата',
          platformIds: [iosId],
        }),
      );

      const updated = await testDb.db.transaction((tx) =>
        repository.updateCheckpoint(admin(), tx, projectId, versionId, created.id, {
          isDone: true,
        }),
      );

      expect(updated.platformIds).toEqual([iosId]);
    });
  });

  describe('отчёт по релизу', () => {
    /** Версия с чекпоинтом и платформой: отчёт всегда начинается с них. */
    async function releasedVersion(): Promise<{ versionId: string; platformId: string }> {
      const platformId = await createPlatform('App Store', PlatformKind.Store);
      const versionId = await createVersion('v1.2');

      const checkpoint = await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, versionId, {
          title: 'Оплата',
          url: 'https://tracker.example.com/TASK-17',
          platformIds: [platformId],
        }),
      );
      await testDb.db.transaction((tx) =>
        repository.updateCheckpoint(admin(), tx, projectId, versionId, checkpoint.id, {
          isDone: true,
        }),
      );
      await testDb.db.transaction((tx) =>
        repository.setRelease(admin(), tx, projectId, versionId, platformId, {
          state: PlatformReleaseState.Released,
          releasedDate: '2026-03-12',
          buildLabel: '1.2.3 (45)',
        }),
      );

      return { versionId, platformId };
    }

    it('собирает паспорт, выпуски, чекпоинты и сводку', async () => {
      const { versionId } = await releasedVersion();

      const report = await repository.findReport(admin(), projectId, versionId);

      expect(report.version).toMatchObject({ label: 'v1.2', releasedDate: '2026-03-12' });
      expect(report.releases[0]).toMatchObject({
        state: PlatformReleaseState.Released,
        buildLabel: '1.2.3 (45)',
      });
      expect(report.checkpoints[0]).toMatchObject({ title: 'Оплата', isDone: true });
      expect(report.summary[0]?.released).toMatchObject({ versionLabel: 'v1.2' });
      expect(report.markdown).toContain('Отчёт по релизу v1.2');
      expect(report.text).toContain('Отчёт по релизу v1.2');
    });

    it('имён окружений в отчёте нет', async () => {
      // Роадмап не читает окружения: это секция «Инфраструктура», и
      // отчёт не обходной путь к ней (инвариант ТЗ 4.1).
      const { versionId } = await releasedVersion();
      await testDb.db
        .insert(environments)
        .values({ projectId, name: 'прод', kind: EnvironmentKind.Production });

      const report = await repository.findReport(admin(), projectId, versionId);

      expect(JSON.stringify(report)).not.toContain('прод');
    });

    it('переносы видны с обеих сторон', async () => {
      // «Перенесено в v1.3» в отчёте v1.2 иначе не собрать: после
      // переноса чекпоинт этой версии уже не принадлежит.
      const from = await createVersion('v1.2');
      const to = await createVersion('v1.3');
      const moved = await testDb.db.transaction((tx) =>
        repository.createCheckpoint(admin(), tx, projectId, from, { title: 'Отчёты' }),
      );
      await testDb.db.transaction((tx) =>
        repository.carryOverCheckpoint(admin(), tx, projectId, from, moved.id, {
          targetVersionId: to,
        }),
      );

      const source = await repository.findReport(admin(), projectId, from);
      const target = await repository.findReport(admin(), projectId, to);

      expect(source.checkpoints).toEqual([]);
      expect(source.carriedOut[0]).toMatchObject({ title: 'Отчёты', carriedTo: 'v1.3' });
      expect(source.markdown).toContain('перенесено в v1.3');
      expect(target.checkpoints[0]).toMatchObject({ title: 'Отчёты', carriedFrom: 'v1.2' });
      expect(target.markdown).toContain('принято из v1.2');
    });

    it('чужая версия не существует', async () => {
      const alien = await createVersion('v1.0', otherProjectId);

      await expect(repository.findReport(admin(), projectId, alien)).rejects.toBeInstanceOf(
        SectionNotVisibleError,
      );
    });

    it('без выдачи секции отчёта нет, с метаданными — уровня не хватает', async () => {
      const versionId = await createVersion('v1.2');

      await expect(repository.findReport(member(), projectId, versionId)).rejects.toBeInstanceOf(
        SectionNotVisibleError,
      );

      await grant(AccessLevel.Metadata);

      await expect(repository.findReport(member(), projectId, versionId)).rejects.toBeInstanceOf(
        InsufficientLevelError,
      );
    });

    describe('публичная ссылка отчёта', () => {
      it('публикация выдаёт токен, повторная — конфликт', async () => {
        const versionId = await createVersion('v1.2');

        const published = await testDb.db.transaction((tx) =>
          repository.publishReport(admin(), tx, projectId, versionId),
        );

        expect(published.token.length).toBeGreaterThanOrEqual(32);
        expect(published.label).toBe('v1.2');
        await expect(
          testDb.db.transaction((tx) =>
            repository.publishReport(admin(), tx, projectId, versionId),
          ),
        ).rejects.toBeInstanceOf(ConflictException);
      });

      it('ссылка живёт на версии, а не на проекте', async () => {
        // Отчёты по разным версиям публикуются независимо: уникум стоит
        // на версии, и вторая версия не упирается в первую.
        const first = await createVersion('v1.2');
        const second = await createVersion('v1.3');

        const one = await testDb.db.transaction((tx) =>
          repository.publishReport(admin(), tx, projectId, first),
        );
        const two = await testDb.db.transaction((tx) =>
          repository.publishReport(admin(), tx, projectId, second),
        );

        expect(two.token).not.toBe(one.token);
        expect((await repository.publicReport(one.token))?.version.label).toBe('v1.2');
        expect((await repository.publicReport(two.token))?.version.label).toBe('v1.3');
      });

      it('публичный отчёт читается по токену, без ссылок на задачи', async () => {
        const { versionId } = await releasedVersion();
        const { token } = await testDb.db.transaction((tx) =>
          repository.publishReport(admin(), tx, projectId, versionId),
        );

        const report = await repository.publicReport(token);

        expect(report?.projectName).toBe('Проект');
        expect(report?.checkpoints[0]?.title).toBe('Оплата');
        expect(report?.checkpoints[0]).not.toHaveProperty('url');
        expect(JSON.stringify(report)).not.toContain('tracker.example.com');
      });

      it('перенесённый чекпоинт тоже уезжает без ссылки', async () => {
        // Второй список чекпоинтов собирается отдельной выборкой, и
        // забыть в нём `withLinks` легче всего.
        const from = await createVersion('v1.2');
        const to = await createVersion('v1.3');
        const moved = await testDb.db.transaction((tx) =>
          repository.createCheckpoint(admin(), tx, projectId, from, {
            title: 'Отчёты',
            url: 'https://tracker.example.com/TASK-18',
          }),
        );
        await testDb.db.transaction((tx) =>
          repository.carryOverCheckpoint(admin(), tx, projectId, from, moved.id, {
            targetVersionId: to,
          }),
        );
        const { token } = await testDb.db.transaction((tx) =>
          repository.publishReport(admin(), tx, projectId, from),
        );

        const report = await repository.publicReport(token);

        expect(report?.carriedOut[0]).toMatchObject({ carriedTo: 'v1.3' });
        expect(report?.carriedOut[0]).not.toHaveProperty('url');
        expect(JSON.stringify(report)).not.toContain('TASK-18');
      });

      it('мусорный токен и отключённая ссылка неразличимы', async () => {
        const versionId = await createVersion('v1.2');

        expect(await repository.publicReport('мусор')).toBeNull();

        const { token } = await testDb.db.transaction((tx) =>
          repository.publishReport(admin(), tx, projectId, versionId),
        );
        await testDb.db.transaction((tx) =>
          repository.unpublishReport(admin(), tx, projectId, versionId),
        );

        expect(await repository.publicReport(token)).toBeNull();
      });

      it('отключение без публикации — «не найдено»', async () => {
        const versionId = await createVersion('v1.2');

        await expect(
          testDb.db.transaction((tx) =>
            repository.unpublishReport(admin(), tx, projectId, versionId),
          ),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it('находит действующий токен версии', async () => {
        const versionId = await createVersion('v1.2');

        expect(await repository.findReportLink(admin(), projectId, versionId)).toBeNull();

        const { token } = await testDb.db.transaction((tx) =>
          repository.publishReport(admin(), tx, projectId, versionId),
        );

        expect(await repository.findReportLink(admin(), projectId, versionId)).toBe(token);
      });

      it('право проверяет выборка, а не контроллер', async () => {
        const versionId = await createVersion('v1.2');

        await expect(
          repository.findReportLink(member(), projectId, versionId),
        ).rejects.toBeInstanceOf(SectionNotVisibleError);

        await grant(AccessLevel.Read);

        await expect(
          testDb.db.transaction((tx) =>
            repository.publishReport(member(), tx, projectId, versionId),
          ),
        ).rejects.toBeInstanceOf(InsufficientLevelError);
        await expect(
          testDb.db.transaction((tx) =>
            repository.unpublishReport(member(), tx, projectId, versionId),
          ),
        ).rejects.toBeInstanceOf(InsufficientLevelError);
      });

      it('удаление версии уносит ссылку на её отчёт', async () => {
        // На ссылке `restrict`: без уборки версия стала бы неудаляемой.
        const versionId = await createVersion('v1.2');
        const { token } = await testDb.db.transaction((tx) =>
          repository.publishReport(admin(), tx, projectId, versionId),
        );

        await testDb.db.transaction((tx) =>
          repository.removeVersion(admin(), tx, projectId, versionId),
        );

        expect(await repository.publicReport(token)).toBeNull();
        expect(await testDb.rowsOf(roadmapReportPublicLinks)).toEqual([]);
      });
    });
  });
});
