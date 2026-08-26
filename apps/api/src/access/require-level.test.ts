import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from './access.service';
import { InsufficientLevelError, SectionNotVisibleError } from './access.errors';
import type { RequestSubject } from './access.types';
import { grants, projects, subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('AccessService.requireLevel', () => {
  let testDb: TestDatabase;
  let service: AccessService;
  let subjectId: string;
  let projectId: string;
  let grantedBy: string;

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

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;
  });

  const subject: RequestSubject = {
    get id() {
      return subjectId;
    },
    kind: SubjectKind.User,
    label: 'подрядчик',
    isSuperadmin: false,
    isRevoked: false,
  };

  async function grant(level: AccessLevel): Promise<void> {
    await testDb.db
      .insert(grants)
      .values({ subjectId, projectId, section: Section.Info, level, grantedBy });
  }

  it('без доступа бросает «не найдено»', async () => {
    await expect(
      service.requireLevel(subject, projectId, Section.Info, AccessLevel.Read),
    ).rejects.toBeInstanceOf(SectionNotVisibleError);
  });

  it('при недостаточном уровне бросает «недостаточно прав»', async () => {
    await grant(AccessLevel.Read);

    await expect(
      service.requireLevel(subject, projectId, Section.Info, AccessLevel.Write),
    ).rejects.toBeInstanceOf(InsufficientLevelError);
  });

  it('при достаточном уровне возвращает уровень', async () => {
    await grant(AccessLevel.Write);

    expect(await service.requireLevel(subject, projectId, Section.Info, AccessLevel.Read)).toBe(
      AccessLevel.Write,
    );
  });

  it('уровень метаданных недостаточен для чтения', async () => {
    await grant(AccessLevel.Metadata);

    await expect(
      service.requireLevel(subject, projectId, Section.Info, AccessLevel.Read),
    ).rejects.toBeInstanceOf(InsufficientLevelError);
  });

  it('уровень метаданных достаточен для метаданных', async () => {
    await grant(AccessLevel.Metadata);

    expect(
      await service.requireLevel(subject, projectId, Section.Info, AccessLevel.Metadata),
    ).toBe(AccessLevel.Metadata);
  });

  it('для несуществующего проекта бросает «не найдено»', async () => {
    // Тот же ответ, что и при отсутствии доступа: различать их — значит
    // раскрывать, какие проекты существуют.
    await expect(
      service.requireLevel(
        subject,
        '00000000-0000-0000-0000-000000000000',
        Section.Info,
        AccessLevel.Read,
      ),
    ).rejects.toBeInstanceOf(SectionNotVisibleError);
  });
});
