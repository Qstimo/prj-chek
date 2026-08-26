import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from './access.service';
import type { RequestSubject } from './access.types';
import { grants, projects, subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('AccessService.visibleProjectIds', () => {
  let testDb: TestDatabase;
  let service: AccessService;
  let subjectId: string;
  let grantedBy: string;
  let visibleId: string;
  let hiddenId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new AccessService(testDb.db);
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

    const [visible] = await testDb.db
      .insert(projects)
      .values({ slug: 'vidimyj', name: 'Видимый' })
      .returning();
    visibleId = visible!.id;

    const [hidden] = await testDb.db
      .insert(projects)
      .values({ slug: 'skrytyj', name: 'Скрытый' })
      .returning();
    hiddenId = hidden!.id;

    await testDb.db.insert(grants).values({
      subjectId,
      projectId: visibleId,
      section: Section.Info,
      level: AccessLevel.Metadata,
      grantedBy,
    });
  });

  const subject = (overrides: Partial<RequestSubject> = {}): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'подрядчик',
    isSuperadmin: false,
    isRevoked: false,
    ...overrides,
  });

  it('возвращает только проекты с выдачей', async () => {
    const ids = await service.visibleProjectIds(subject());

    expect(ids).toEqual([visibleId]);
  });

  it('не раскрывает существование проектов без выдачи', async () => {
    const ids = await service.visibleProjectIds(subject());

    expect(ids).not.toContain(hiddenId);
  });

  it('суперадмину возвращает все проекты', async () => {
    const ids = await service.visibleProjectIds(subject({ isSuperadmin: true }));

    expect(ids).toHaveLength(2);
  });

  it('отозванному субъекту возвращает пустой список', async () => {
    expect(await service.visibleProjectIds(subject({ isRevoked: true }))).toEqual([]);
  });

  it('не дублирует проект при выдачах на несколько секций', async () => {
    await testDb.db.insert(grants).values({
      subjectId,
      projectId: visibleId,
      section: Section.Docs,
      level: AccessLevel.Read,
      grantedBy,
    });

    expect(await service.visibleProjectIds(subject())).toEqual([visibleId]);
  });
});
