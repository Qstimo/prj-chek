import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from './access.service';
import type { RequestSubject } from './access.types';
import { grants, projects, subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('уровни субъекта по секциям', () => {
  let testDb: TestDatabase;
  let access: AccessService;
  let projectId: string;
  let subjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    access = new AccessService(testDb.db);
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

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;
  });

  const member = (): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'user@cairn.local',
    isSuperadmin: false,
    isRevoked: false,
  });

  it('перечисляет только секции с выдачей', async () => {
    // Секция без выдачи отсутствует в карте, а не приходит с уровнем «нет»:
    // отсутствие доступа выражается отсутствием записи (спека 4.3).
    await testDb.db.insert(grants).values({
      subjectId,
      projectId,
      section: Section.Infrastructure,
      level: AccessLevel.Read,
      grantedBy: adminUserId,
    });

    const levels = await access.levelsForProject(member(), projectId);

    expect(levels).toEqual({ [Section.Infrastructure]: AccessLevel.Read });
  });

  it('суперадмину отдаёт запись по всем секциям', async () => {
    const levels = await access.levelsForProject(
      { ...member(), isSuperadmin: true },
      projectId,
    );

    expect(Object.keys(levels)).toHaveLength(Object.values(Section).length);
    expect(levels[Section.Variables]).toBe(AccessLevel.Write);
  });

  it('отозванному субъекту не отдаёт ничего', async () => {
    // Отзыв сильнее суперадминства (спека 5.1).
    const levels = await access.levelsForProject(
      { ...member(), isSuperadmin: true, isRevoked: true },
      projectId,
    );

    expect(levels).toEqual({});
  });

  it('субъекту без выдач отдаёт пустую карту', async () => {
    expect(await access.levelsForProject(member(), projectId)).toEqual({});
  });
});
