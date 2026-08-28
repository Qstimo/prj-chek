import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import { InsufficientLevelError, SectionNotVisibleError } from '../access/access.errors';
import type { RequestSubject } from '../access/access.types';
import { docPages, grants, projects, subjects, users } from '../db/schema';
import { DocsRepository } from './docs.repository';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('репозиторий документации', () => {
  let testDb: TestDatabase;
  let repository: DocsRepository;
  let projectId: string;
  let otherProjectId: string;
  let subjectId: string;
  let adminSubjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new DocsRepository(testDb.db, new AccessService(testDb.db));
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
      section: Section.Docs,
      level,
      grantedBy: adminUserId,
    });
  }

  async function createPage(title = 'Развёртывание'): Promise<string> {
    const created = await testDb.db.transaction((tx) =>
      repository.create(admin(), tx, projectId, {
        title,
        content: '# Как развернуть\n\nСекретные шаги.',
      }),
    );

    return created.id;
  }

  it('на уровне метаданных список без содержимого', async () => {
    await createPage();
    await grant(AccessLevel.Metadata);

    const list = await repository.findForProject(member(), projectId);

    expect(list[0]).toMatchObject({ title: 'Развёртывание' });
    expect(JSON.stringify(list)).not.toContain('Секретные шаги');
  });

  it('на уровне чтения содержимое приходит', async () => {
    const id = await createPage();
    await grant(AccessLevel.Read);

    const page = await repository.findById(member(), projectId, id);

    expect(JSON.stringify(page)).toContain('Секретные шаги');
  });

  it('список отсортирован по заголовку', async () => {
    await createPage('Ы последняя');
    await createPage('А первая');

    const list = await repository.findForProject(admin(), projectId);

    expect(list.map((page) => page.title)).toEqual(['А первая', 'Ы последняя']);
  });

  it('заголовок уникален в проекте, в чужом — свободен', async () => {
    await createPage();

    await expect(createPage()).rejects.toThrow();
    await expect(
      testDb.db.transaction((tx) =>
        repository.create(admin(), tx, otherProjectId, { title: 'Развёртывание', content: 'x' }),
      ),
    ).resolves.toBeDefined();
  });

  it('создание требует записи, список — метаданных', async () => {
    await grant(AccessLevel.Read);

    await expect(
      testDb.db.transaction((tx) =>
        repository.create(member(), tx, projectId, { title: 'Т', content: 'С' }),
      ),
    ).rejects.toBeInstanceOf(InsufficientLevelError);
    await expect(repository.findForProject(member(), projectId)).resolves.toBeDefined();
  });

  it('без выдачи секция скрыта', async () => {
    await expect(repository.findForProject(member(), projectId)).rejects.toBeInstanceOf(
      SectionNotVisibleError,
    );
  });

  it('не отдаёт страницу через чужой проект', async () => {
    const id = await createPage();

    await expect(repository.findById(admin(), otherProjectId, id)).rejects.toBeInstanceOf(
      SectionNotVisibleError,
    );
  });

  it('правка и удаление работают', async () => {
    const id = await createPage();

    const updated = await testDb.db.transaction((tx) =>
      repository.update(admin(), tx, projectId, id, { title: 'Новое имя' }),
    );
    expect(updated.title).toBe('Новое имя');

    await testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, id));
    expect(await testDb.db.select().from(docPages)).toHaveLength(0);
  });
});
