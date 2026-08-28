import { SubjectKind } from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { auditLog, projects, subjects, users } from '../db/schema';
import { RoadmapRepository } from './roadmap.repository';
import { RoadmapService } from './roadmap.service';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('сервис роадмапа', () => {
  let testDb: TestDatabase;
  let service: RoadmapService;
  let projectId: string;
  let subjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new RoadmapService(
      testDb.db,
      new RoadmapRepository(testDb.db, new AccessService(testDb.db)),
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

  async function entriesOf(action: AuditAction) {
    return testDb.db.select().from(auditLog).where(eq(auditLog.action, action));
  }

  it('создание версии пишет обозначение в журнал', async () => {
    await service.createVersion(admin(), projectId, { label: 'v1.0' });

    const [entry] = await entriesOf(AuditAction.RoadmapVersionCreated);
    expect(entry?.metadata).toMatchObject({ label: 'v1.0' });
    expect(entry?.projectId).toBe(projectId);
  });

  it('удаление версии пишет обозначение', async () => {
    const version = await service.createVersion(admin(), projectId, { label: 'v1.0' });

    await service.removeVersion(admin(), projectId, version.id);

    const [entry] = await entriesOf(AuditAction.RoadmapVersionDeleted);
    expect(entry?.metadata).toMatchObject({ label: 'v1.0' });
  });

  it('чекпоинт пишется с формулировкой', async () => {
    const version = await service.createVersion(admin(), projectId, { label: 'v1.0' });

    const checkpoint = await service.createCheckpoint(admin(), projectId, version.id, {
      title: 'Готов вход',
    });
    await service.updateCheckpoint(admin(), projectId, version.id, checkpoint.id, {
      isDone: true,
    });

    const [created] = await entriesOf(AuditAction.CheckpointCreated);
    const [updated] = await entriesOf(AuditAction.CheckpointUpdated);
    expect(created?.metadata).toMatchObject({ title: 'Готов вход' });
    expect(updated?.metadata).toMatchObject({ fields: ['isDone'] });
  });

  it('публикация и отключение попадают в журнал', async () => {
    await service.publish(admin(), projectId);
    await service.unpublish(admin(), projectId);

    expect(await entriesOf(AuditAction.RoadmapPublished)).toHaveLength(1);
    expect(await entriesOf(AuditAction.RoadmapUnpublished)).toHaveLength(1);
  });

  it('отказ не оставляет следов', async () => {
    await expect(
      service.removeVersion(admin(), projectId, '11111111-1111-1111-1111-111111111111'),
    ).rejects.toThrow();

    expect(await entriesOf(AuditAction.RoadmapVersionDeleted)).toHaveLength(0);
  });
});
