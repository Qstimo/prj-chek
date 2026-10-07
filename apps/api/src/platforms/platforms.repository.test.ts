import { AccessLevel, EnvironmentKind, PlatformKind, PlatformReleaseState, Section, SubjectKind } from '@cairn/shared';
import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { InsufficientLevelError, SectionNotVisibleError } from '../access/access.errors';
import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import {
  checkpointPlatforms,
  environmentPlatforms,
  environments,
  grants,
  projectPlatforms,
  projects,
  roadmapCheckpoints,
  roadmapVersions,
  subjects,
  users,
  versionPlatformReleases,
} from '../db/schema';
import { PlatformsRepository } from './platforms.repository';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('репозиторий платформ', () => {
  let testDb: TestDatabase;
  let repository: PlatformsRepository;
  let projectId: string;
  let otherProjectId: string;
  let environmentId: string;
  let subjectId: string;
  let adminSubjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new PlatformsRepository(testDb.db, new AccessService(testDb.db));
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

    // Окружений в образце-тесте роадмапа нет: двум проверкам привязки
    // платформ нужна настоящая строка.
    const [environment] = await testDb.db
      .insert(environments)
      .values({ projectId, name: 'Прод', kind: EnvironmentKind.Production })
      .returning();
    environmentId = environment!.id;
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

  /** Выдача именно на «Инфо»: платформа — поле паспорта проекта. */
  async function grant(level: AccessLevel): Promise<void> {
    await testDb.db.insert(grants).values({
      subjectId,
      projectId,
      section: Section.Info,
      level,
      grantedBy: adminUserId,
    });
  }

  /**
   * Позиция параметром: выборка сортирует по ней, и одинаковая позиция
   * у всех платформ превратила бы тест порядка в проверку времени создания.
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

  it('скрывает платформы от субъекта без выдачи', async () => {
    // Отсутствие доступа — 404, а не 403: ответ 403 сообщил бы, что
    // проект существует (ТЗ 4.2).
    await expect(repository.findForProject(member(), projectId)).rejects.toBeInstanceOf(
      SectionNotVisibleError,
    );
  });

  it('отказывает уровню ниже требуемого отдельной ошибкой', async () => {
    await grant(AccessLevel.Read);

    await expect(
      testDb.db.transaction((tx) =>
        repository.create(member(), tx, projectId, { kind: PlatformKind.Server, name: 'API' }),
      ),
    ).rejects.toBeInstanceOf(InsufficientLevelError);
  });

  it('отдаёт платформы по порядку на уровне метаданных', async () => {
    await grant(AccessLevel.Metadata);
    await testDb.db.transaction(async (tx) => {
      await repository.create(admin(), tx, projectId, { kind: PlatformKind.Server, name: 'API' });
      await repository.create(admin(), tx, projectId, { kind: PlatformKind.Server, name: 'Веб' });
    });

    const platforms = await repository.findForProject(member(), projectId);

    expect(platforms.map((platform) => platform.name)).toEqual(['API', 'Веб']);
    expect(platforms.map((platform) => platform.position)).toEqual([1, 2]);
  });

  it('отказывает повторному имени внятно', async () => {
    await createPlatform('API');

    await expect(
      testDb.db.transaction((tx) =>
        repository.create(admin(), tx, projectId, { kind: PlatformKind.Server, name: 'API' }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('не видит платформу чужого проекта в правке и удалении', async () => {
    // Уровень проверяется по проекту из адреса: без проверки
    // принадлежности запись в своём проекте давала бы править чужой.
    const foreign = await createPlatform('API', PlatformKind.Server, 1, otherProjectId);

    await expect(
      testDb.db.transaction((tx) =>
        repository.update(admin(), tx, projectId, foreign, { name: 'Веб' }),
      ),
    ).rejects.toBeInstanceOf(SectionNotVisibleError);
    await expect(
      testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, foreign)),
    ).rejects.toBeInstanceOf(SectionNotVisibleError);
  });

  it('удаление платформы снимает выпуски, теги и связи', async () => {
    // На всех ссылках `restrict`: без явной уборки удаление упёрлось бы
    // в ссылочную целостность и ответило 500 вместо того, чтобы сработать.
    const platformId = await createPlatform('API');
    const [version] = await testDb.db
      .insert(roadmapVersions)
      .values({ projectId, label: 'v1.0', position: 1 })
      .returning();
    const [checkpoint] = await testDb.db
      .insert(roadmapCheckpoints)
      .values({ versionId: version!.id, title: 'Оплата', position: 1 })
      .returning();
    await testDb.db
      .insert(versionPlatformReleases)
      .values({ versionId: version!.id, platformId, state: PlatformReleaseState.OnTest });
    await testDb.db
      .insert(checkpointPlatforms)
      .values({ checkpointId: checkpoint!.id, platformId });
    await testDb.db.insert(environmentPlatforms).values({ environmentId, platformId });

    await testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, platformId));

    expect(await testDb.rowsOf(versionPlatformReleases)).toHaveLength(0);
    expect(await testDb.rowsOf(checkpointPlatforms)).toHaveLength(0);
    expect(await testDb.rowsOf(environmentPlatforms)).toHaveLength(0);
    expect(await testDb.rowsOf(projectPlatforms)).toHaveLength(0);
  });

  it('не ставит магазин в окружение', async () => {
    const storeId = await createPlatform('App Store', PlatformKind.Store);

    await expect(
      testDb.db.transaction((tx) =>
        repository.setEnvironmentPlatforms(tx, environmentId, [storeId]),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('не ставит в окружение платформу чужого проекта', async () => {
    const foreign = await createPlatform('API', PlatformKind.Server, 1, otherProjectId);

    await expect(
      testDb.db.transaction((tx) =>
        repository.setEnvironmentPlatforms(tx, environmentId, [foreign]),
      ),
    ).rejects.toBeInstanceOf(SectionNotVisibleError);
  });

  it('заменяет набор платформ окружения целиком', async () => {
    const apiId = await createPlatform('API', PlatformKind.Server, 1);
    const webId = await createPlatform('Веб', PlatformKind.Server, 2);

    await testDb.db.transaction((tx) =>
      repository.setEnvironmentPlatforms(tx, environmentId, [apiId, webId]),
    );
    await testDb.db.transaction((tx) =>
      repository.setEnvironmentPlatforms(tx, environmentId, [webId]),
    );

    const links = await testDb.rowsOf(environmentPlatforms);

    expect(links.map((link) => link.platformId)).toEqual([webId]);
  });

  it('заводит платформы вместе с проектом только суперадмину', async () => {
    await expect(
      testDb.db.transaction((tx) =>
        repository.createMany(member(), tx, projectId, [
          { kind: PlatformKind.Server, name: 'API' },
        ]),
      ),
    ).rejects.toBeInstanceOf(InsufficientLevelError);
  });

  it('заводит платформы списком, раздавая позиции по порядку', async () => {
    const created = await testDb.db.transaction((tx) =>
      repository.createMany(admin(), tx, projectId, [
        { kind: PlatformKind.Server, name: 'API' },
        { kind: PlatformKind.Store, name: 'App Store' },
      ]),
    );

    expect(created.map((platform) => [platform.name, platform.position])).toEqual([
      ['API', 1],
      ['App Store', 2],
    ]);
  });
});
