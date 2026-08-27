import { AuditSubjectKind, SubjectKind } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditQueryService } from './audit-query.service';
import { AuditAction } from './audit.types';
import { auditLog, projects, subjects } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('AuditQueryService', () => {
  let testDb: TestDatabase;
  let service: AuditQueryService;
  let subjectId: string;
  let projectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new AuditQueryService(testDb.db);
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'админ' })
      .returning();
    subjectId = subject!.id;

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;

    await testDb.db.insert(auditLog).values([
      {
        subjectId,
        subjectKind: AuditSubjectKind.User,
        subjectLabel: 'админ',
        action: AuditAction.ProjectCreated,
        projectId,
        createdAt: new Date('2026-01-01T10:00:00Z'),
      },
      {
        subjectId,
        subjectKind: AuditSubjectKind.User,
        subjectLabel: 'админ',
        action: AuditAction.LoginSucceeded,
        createdAt: new Date('2026-01-02T10:00:00Z'),
      },
      {
        subjectId: null,
        subjectKind: AuditSubjectKind.System,
        subjectLabel: 'cli create-superadmin',
        action: AuditAction.SuperadminCreated,
        createdAt: new Date('2026-01-03T10:00:00Z'),
      },
    ]);
  });

  it('возвращает записи от новых к старым', async () => {
    // Расследование начинают с последнего события, а не с первого.
    const page = await service.query({ limit: 50, offset: 0 });

    expect(page.entries.map((entry) => entry.action)).toEqual([
      AuditAction.SuperadminCreated,
      AuditAction.LoginSucceeded,
      AuditAction.ProjectCreated,
    ]);
  });

  it('сообщает общее число записей', async () => {
    const page = await service.query({ limit: 1, offset: 0 });

    expect(page.entries).toHaveLength(1);
    expect(page.total).toBe(3);
  });

  it('фильтрует по субъекту', async () => {
    const page = await service.query({ subjectId, limit: 50, offset: 0 });

    expect(page.total).toBe(2);
  });

  it('фильтрует по проекту', async () => {
    const page = await service.query({ projectId, limit: 50, offset: 0 });

    expect(page.total).toBe(1);
  });

  it('фильтрует по типу действия', async () => {
    const page = await service.query({
      action: AuditAction.LoginSucceeded,
      limit: 50,
      offset: 0,
    });

    expect(page.total).toBe(1);
  });

  it('фильтрует по диапазону дат', async () => {
    const page = await service.query({
      from: '2026-01-02T00:00:00.000Z',
      to: '2026-01-02T23:59:59.000Z',
      limit: 50,
      offset: 0,
    });

    expect(page.total).toBe(1);
  });

  it('отдаёт записи без субъекта', async () => {
    // Действия с консоли субъекта не имеют (спека 4.7).
    const page = await service.query({ limit: 50, offset: 0 });

    expect(page.entries[0]).toMatchObject({
      subjectId: null,
      subjectKind: AuditSubjectKind.System,
    });
  });

  it('листает страницами', async () => {
    const page = await service.query({ limit: 1, offset: 2 });

    expect(page.entries[0]?.action).toBe(AuditAction.ProjectCreated);
  });
});
