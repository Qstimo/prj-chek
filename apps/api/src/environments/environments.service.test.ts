import { EnvironmentKind, SubjectKind } from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import { DomainsRepository } from '../domains/domains.repository';
import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { auditLog, projects, subjects, users } from '../db/schema';
import { EnvironmentsRepository } from './environments.repository';
import { EnvironmentsService } from './environments.service';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('сервис окружений', () => {
  let testDb: TestDatabase;
  let service: EnvironmentsService;
  let projectId: string;
  let subjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    service = new EnvironmentsService(
      testDb.db,
      new EnvironmentsRepository(testDb.db, new AccessService(testDb.db), new DomainsRepository(testDb.db)),
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

  it('пишет создание в журнал', async () => {
    await service.create(admin(), projectId, { name: 'Прод', kind: EnvironmentKind.Production });

    const [entry] = await entriesOf(AuditAction.EnvironmentCreated);

    expect(entry?.projectId).toBe(projectId);
    expect(entry?.metadata).toMatchObject({ name: 'Прод' });
  });

  it('пишет правку с перечнем изменённых полей', async () => {
    // Значения полей в журнал не попадают: тем же путём на этапе 4 пойдут
    // переменные, и запись значений свела бы на нет их шифрование (ТЗ 9).
    const created = await service.create(admin(), projectId, {
      name: 'Прод',
      kind: EnvironmentKind.Production,
    });

    await service.update(admin(), projectId, created.id, { host: 'prod.example.com' });

    const [entry] = await entriesOf(AuditAction.EnvironmentUpdated);

    expect(entry?.metadata).toMatchObject({ fields: ['host'] });
    expect(JSON.stringify(entry?.metadata)).not.toContain('prod.example.com');
  });

  it('пишет удаление вместе с именем', async () => {
    // После удаления строки имя больше неоткуда взять, а запись журнала
    // обязана оставаться читаемой.
    const created = await service.create(admin(), projectId, {
      name: 'Прод',
      kind: EnvironmentKind.Production,
    });

    await service.remove(admin(), projectId, created.id);

    const [entry] = await entriesOf(AuditAction.EnvironmentDeleted);

    expect(entry?.metadata).toMatchObject({ name: 'Прод' });
    expect(entry?.entityId).toBe(created.id);
  });

  it('не пишет в журнал, когда изменение не состоялось', async () => {
    // Отказ по правам обязан оставить базу нетронутой: и окружение,
    // и запись журнала откатываются одной транзакцией.
    await expect(
      service.remove(admin(), projectId, '11111111-1111-1111-1111-111111111111'),
    ).rejects.toThrow();

    expect(await entriesOf(AuditAction.EnvironmentDeleted)).toHaveLength(0);
  });
});
