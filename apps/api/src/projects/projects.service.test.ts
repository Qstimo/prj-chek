import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import { InsufficientLevelError } from '../access/access.errors';
import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { ProjectsRepository } from './projects.repository';
import { ProjectsService } from './projects.service';
import { auditLog, grants, projects, subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('ProjectsService', () => {
  let testDb: TestDatabase;
  let service: ProjectsService;
  let subjectId: string;
  let adminSubjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const access = new AccessService(testDb.db);
    service = new ProjectsService(
      testDb.db,
      new ProjectsRepository(testDb.db, access),
      new AuditService(),
      access,
    );
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
    adminSubjectId = adminSubject!.id;

    const [admin] = await testDb.db
      .insert(users)
      .values({ subjectId: adminSubjectId, email: 'admin@cairn.local', isSuperadmin: true })
      .returning();
    adminUserId = admin!.id;
  });

  const contractor = (): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'подрядчик',
    isSuperadmin: false,
    isRevoked: false,
  });

  const admin = (): RequestSubject => ({
    id: adminSubjectId,
    kind: SubjectKind.User,
    label: 'админ',
    isSuperadmin: true,
    isRevoked: false,
  });

  describe('create', () => {
    it('создаёт проект и пишет действие в журнал', async () => {
      const created = await service.create(admin(), { name: 'Новый проект' });

      const [entry] = await testDb.db.select().from(auditLog);

      expect(created.name).toBe('Новый проект');
      expect(entry?.action).toBe(AuditAction.ProjectCreated);
      expect(entry?.projectId).toBe(created.id);
    });

    it('не создаёт проект без записи в журнал', async () => {
      // Транзакция общая: либо есть и проект, и след, либо нет ничего (спека 7.3).
      await service.create(admin(), { name: 'Новый проект' });

      expect(await testDb.db.select().from(projects)).toHaveLength(1);
      expect(await testDb.db.select().from(auditLog)).toHaveLength(1);
    });

    it('отказывает не-суперадмину и ничего не пишет в журнал', async () => {
      await expect(service.create(contractor(), { name: 'Чужой' })).rejects.toBeInstanceOf(
        InsufficientLevelError,
      );

      expect(await testDb.db.select().from(auditLog)).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('изменяет проект и пишет действие в журнал', async () => {
      const created = await service.create(admin(), { name: 'Проект' });
      await testDb.db.insert(grants).values({
        subjectId,
        projectId: created.id,
        section: Section.Info,
        level: AccessLevel.Write,
        grantedBy: adminUserId,
      });

      await service.update(contractor(), created.id, { name: 'Переименован' });

      const [entry] = await testDb.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, AuditAction.ProjectUpdated));

      expect(entry?.projectId).toBe(created.id);
    });

    it('записывает, какие поля изменились', async () => {
      // Журнал должен отвечать на вопрос «что именно поменяли», иначе
      // расследование инцидента упирается в пустую запись.
      const created = await service.create(admin(), { name: 'Проект' });

      await service.update(admin(), created.id, { name: 'Переименован', notes: 'заметка' });

      const [entry] = await testDb.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, AuditAction.ProjectUpdated));

      expect(entry?.metadata).toMatchObject({ fields: ['name', 'notes'] });
    });

    it('не записывает значения изменённых полей', async () => {
      // В журнал попадают имена полей, но не содержимое: на будущих этапах
      // тем же путём пойдут секреты (ТЗ 9).
      const created = await service.create(admin(), { name: 'Проект' });

      await service.update(admin(), created.id, { notes: 'секретная заметка' });

      const [entry] = await testDb.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, AuditAction.ProjectUpdated));

      expect(JSON.stringify(entry?.metadata)).not.toContain('секретная заметка');
    });

    it('при отказе в правах ничего не пишет в журнал', async () => {
      const created = await service.create(admin(), { name: 'Проект' });
      await testDb.db.delete(auditLog);

      await expect(service.update(contractor(), created.id, { name: 'Чужое' })).rejects.toThrow();

      expect(await testDb.db.select().from(auditLog)).toHaveLength(0);
    });
  });
});
