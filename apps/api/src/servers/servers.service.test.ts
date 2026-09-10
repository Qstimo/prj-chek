import { SubjectKind } from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { auditLog, servers, subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';
import { ServersRepository } from './servers.repository';
import { ServersService } from './servers.service';

describe('сервис серверов', () => {
  let testDb: TestDatabase;
  let service: ServersService;
  let admin: RequestSubject;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new ServersService(testDb.db, new ServersRepository(testDb.db), new AuditService());
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
    await testDb.db.insert(users).values({
      subjectId: subject!.id,
      email: 'admin@cairn.local',
      passwordHash: 'хэш',
      isSuperadmin: true,
    });

    admin = {
      id: subject!.id,
      kind: SubjectKind.User,
      label: 'admin@cairn.local',
      isSuperadmin: true,
      isRevoked: false,
    };
  });

  it('записывает создание сервера в журнал', async () => {
    const created = await service.create(admin, { name: 'hetzner-fsn-1' });

    const [entry] = await testDb.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, AuditAction.ServerCreated));

    expect(entry).toMatchObject({ entityType: 'server', entityId: created.id, projectId: null });
    expect(entry?.metadata).toMatchObject({ name: 'hetzner-fsn-1' });
  });

  it('записывает имена изменённых полей, но не значения', async () => {
    // Срок оплаты и владелец — не секреты, но правило журнала одно для всех
    // сущностей: значения в журнал не попадают.
    const created = await service.create(admin, { name: 'srv' });

    await service.update(admin, created.id, { paidUntil: '2027-01-01', owner: 'ООО Ромашка' });

    const [entry] = await testDb.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, AuditAction.ServerUpdated));

    expect(entry?.metadata).toEqual({ name: 'srv', fields: ['paidUntil', 'owner'] });
  });

  it('записывает удаление сервера', async () => {
    const created = await service.create(admin, { name: 'srv' });

    await service.remove(admin, created.id);

    const [entry] = await testDb.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, AuditAction.ServerDeleted));

    expect(entry?.metadata).toMatchObject({ name: 'srv' });
    expect(await testDb.db.select().from(servers)).toEqual([]);
  });

  it('откатывает запись журнала вместе с неудавшейся правкой', async () => {
    await service.create(admin, { name: 'занято' });
    const created = await service.create(admin, { name: 'srv' });

    await expect(service.update(admin, created.id, { name: 'занято' })).rejects.toThrow();

    const entries = await testDb.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, AuditAction.ServerUpdated));

    expect(entries).toEqual([]);
  });
});
