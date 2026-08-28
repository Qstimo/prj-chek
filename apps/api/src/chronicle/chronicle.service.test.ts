import { SubjectKind } from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { auditLog, projects, subjects, users } from '../db/schema';
import { ChronicleRepository } from './chronicle.repository';
import { ChronicleService } from './chronicle.service';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('сервис хроники', () => {
  let testDb: TestDatabase;
  let service: ChronicleService;
  let projectId: string;
  let subjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    service = new ChronicleService(
      testDb.db,
      new ChronicleRepository(testDb.db, new AccessService(testDb.db)),
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

  const INPUT = {
    occurredOn: '2026-08-27',
    title: 'Встреча по релизу',
    content: 'Решили выпускать в пятницу.',
  };

  async function entriesOf(action: AuditAction) {
    return testDb.db.select().from(auditLog).where(eq(auditLog.action, action));
  }

  it('пишет создание в журнал', async () => {
    await service.create(admin(), projectId, INPUT);

    const [entry] = await entriesOf(AuditAction.ChronicleEntryCreated);

    expect(entry?.projectId).toBe(projectId);
    expect(entry?.metadata).toMatchObject({ title: 'Встреча по релизу' });
  });

  it('пишет правку с перечнем полей, но без содержимого', async () => {
    const created = await service.create(admin(), projectId, INPUT);

    await service.update(admin(), projectId, created.id, { content: 'Перенесли на понедельник' });

    const [entry] = await entriesOf(AuditAction.ChronicleEntryUpdated);

    expect(entry?.metadata).toMatchObject({ fields: ['content'] });
    expect(JSON.stringify(entry?.metadata)).not.toContain('понедельник');
  });

  it('пишет удаление вместе с заголовком и датой', async () => {
    const created = await service.create(admin(), projectId, INPUT);

    await service.remove(admin(), projectId, created.id);

    const [entry] = await entriesOf(AuditAction.ChronicleEntryDeleted);

    expect(entry?.metadata).toMatchObject({
      title: 'Встреча по релизу',
      occurredOn: '2026-08-27',
    });
  });

  it('не пишет в журнал, когда изменение не состоялось', async () => {
    await expect(
      service.remove(admin(), projectId, '11111111-1111-1111-1111-111111111111'),
    ).rejects.toThrow();

    expect(await entriesOf(AuditAction.ChronicleEntryDeleted)).toHaveLength(0);
  });
});
