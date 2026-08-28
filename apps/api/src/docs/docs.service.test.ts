import { SubjectKind } from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { auditLog, projects, subjects, users } from '../db/schema';
import { DocsRepository } from './docs.repository';
import { DocsService } from './docs.service';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('сервис документации', () => {
  let testDb: TestDatabase;
  let service: DocsService;
  let projectId: string;
  let subjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new DocsService(
      testDb.db,
      new DocsRepository(testDb.db, new AccessService(testDb.db)),
      new AuditService(),
    );
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    subjectId = subject!.id;
    await testDb.db.insert(users).values({
      subjectId,
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

  const admin = (): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'admin@cairn.local',
    isSuperadmin: true,
    isRevoked: false,
  });

  it('пишет действия в журнал без содержимого страницы', async () => {
    const MARKER = 'секретное содержимое страницы';

    const created = await service.create(admin(), projectId, {
      title: 'Развёртывание',
      content: MARKER,
    });
    await service.update(admin(), projectId, created.id, { content: `${MARKER} 2` });
    await service.remove(admin(), projectId, created.id);

    const entries = await testDb.db.select().from(auditLog);
    const serialized = JSON.stringify(entries);

    expect(
      await testDb.db.select().from(auditLog).where(eq(auditLog.action, AuditAction.DocPageCreated)),
    ).toHaveLength(1);
    expect(
      await testDb.db.select().from(auditLog).where(eq(auditLog.action, AuditAction.DocPageUpdated)),
    ).toHaveLength(1);
    expect(
      await testDb.db.select().from(auditLog).where(eq(auditLog.action, AuditAction.DocPageDeleted)),
    ).toHaveLength(1);
    expect(serialized).toContain('Развёртывание');
    expect(serialized).not.toContain(MARKER);
  });

  it('отказ не оставляет следов', async () => {
    await expect(
      service.remove(admin(), projectId, '11111111-1111-1111-1111-111111111111'),
    ).rejects.toThrow();

    expect(
      await testDb.db.select().from(auditLog).where(eq(auditLog.action, AuditAction.DocPageDeleted)),
    ).toHaveLength(0);
  });
});
