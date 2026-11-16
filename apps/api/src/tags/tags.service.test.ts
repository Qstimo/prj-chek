import { SubjectKind } from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { auditLog, projects, subjects, users } from '../db/schema';
import { TagsRepository } from './tags.repository';
import { TagsService } from './tags.service';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('сервис тегов', () => {
  let testDb: TestDatabase;
  let service: TagsService;
  let projectId: string;
  let adminSubjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new TagsService(
      testDb.db,
      new TagsRepository(testDb.db, new AccessService(testDb.db)),
      new AuditService(),
    );
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
    await testDb.db.insert(users).values({
      subjectId: adminSubjectId,
      email: 'admin@cairn.local',
      passwordHash: 'хэш',
      isSuperadmin: true,
    });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;
  });

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

  it('пишет в журнал новый набор тегов', async () => {
    await service.set(admin(), projectId, ['Web']);

    const [entry] = await testDb.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, AuditAction.ProjectTagsSet));

    expect(entry).toMatchObject({ entityType: 'project', entityId: projectId, projectId });
    expect(entry?.metadata).toEqual({ tags: ['Web'] });
  });

  it('снятие всех тегов тоже попадает в журнал', async () => {
    // Иначе проект тихо перестал бы быть «Web», и по журналу было бы
    // не узнать, когда это случилось.
    await service.set(admin(), projectId, ['Web']);
    await service.set(admin(), projectId, []);

    const entries = await testDb.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, AuditAction.ProjectTagsSet));

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.metadata)).toContainEqual({ tags: [] });
  });
});
