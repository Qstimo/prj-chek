import { AuditSubjectKind, SubjectKind } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditService } from './audit.service';
import { AuditAction, type AuditActor } from './audit.types';
import { auditLog, projects, subjects } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('AuditService', () => {
  let testDb: TestDatabase;
  let service: AuditService;
  let actor: AuditActor;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new AuditService();
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

    actor = { kind: AuditSubjectKind.User, id: subject!.id, label: 'админ' };
  });

  it('записывает действие субъекта', async () => {
    await testDb.db.transaction(async (tx) => {
      await service.record(tx, actor, { action: AuditAction.ProjectCreated });
    });

    const [entry] = await testDb.db.select().from(auditLog);

    expect(entry?.action).toBe(AuditAction.ProjectCreated);
    expect(entry?.subjectKind).toBe(AuditSubjectKind.User);
    expect(entry?.subjectLabel).toBe('админ');
  });

  it('записывает действие с консоли без субъекта', async () => {
    await testDb.db.transaction(async (tx) => {
      await service.record(
        tx,
        { kind: AuditSubjectKind.System, id: null, label: 'cli create-superadmin' },
        { action: AuditAction.SuperadminCreated },
      );
    });

    const [entry] = await testDb.db.select().from(auditLog);

    expect(entry?.subjectId).toBeNull();
    expect(entry?.subjectKind).toBe(AuditSubjectKind.System);
  });

  it('откатывается вместе с действием', async () => {
    // Либо есть и изменение, и его след, либо нет ни того ни другого (спека 7.3).
    await expect(
      testDb.db.transaction(async (tx) => {
        await tx.insert(projects).values({ slug: 'proekt', name: 'Проект' });
        await service.record(tx, actor, { action: AuditAction.ProjectCreated });

        throw new Error('сбой после записи');
      }),
    ).rejects.toThrow('сбой после записи');

    expect(await testDb.db.select().from(auditLog)).toHaveLength(0);
    expect(await testDb.db.select().from(projects)).toHaveLength(0);
  });

  it('сохраняет метку субъекта неизменной после её смены', async () => {
    await testDb.db.transaction(async (tx) => {
      await service.record(tx, actor, { action: AuditAction.ProjectCreated });
    });

    await testDb.db.update(subjects).set({ label: 'другая метка' });

    const [entry] = await testDb.db.select().from(auditLog);

    expect(entry?.subjectLabel).toBe('админ');
  });
});
