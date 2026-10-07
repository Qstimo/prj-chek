import {
  AccessLevel,
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
  grants,
  projectPlatforms,
  projects,
  roadmapCheckpoints,
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
      const token = await testDb.db.transaction((tx) => repository.publish(tx, projectId));

      const roadmap = await repository.publicRoadmap(token);

      expect(roadmap?.versions[0]?.checkpoints[0]).not.toHaveProperty('url');
      expect(JSON.stringify(roadmap)).not.toContain('tracker.example.com');
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
      const token = await testDb.db.transaction((tx) => repository.publish(tx, projectId));

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
});
