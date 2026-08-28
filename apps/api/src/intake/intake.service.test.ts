import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { auditLog, grants, projects, subjects, users } from '../db/schema';
import { IntakeService } from './intake.service';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('сервис приёмного адреса', () => {
  let testDb: TestDatabase;
  let service: IntakeService;
  let projectId: string;
  let adminSubjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new IntakeService(testDb.db, new AuditService());
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

  const admin = (): RequestSubject => ({
    id: adminSubjectId,
    kind: SubjectKind.User,
    label: 'admin@cairn.local',
    isSuperadmin: true,
    isRevoked: false,
  });

  it('создаёт субъект адреса с выдачей на хронику', async () => {
    const token = await service.createAddress(admin(), projectId);

    const [subject] = await testDb.db
      .select()
      .from(subjects)
      .where(and(eq(subjects.kind, SubjectKind.IntakeAddress), eq(subjects.label, token)));
    const [grant] = await testDb.db
      .select()
      .from(grants)
      .where(eq(grants.subjectId, subject!.id));

    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(grant).toMatchObject({
      projectId,
      section: Section.Chronicle,
      level: AccessLevel.Write,
    });

    const [entry] = await testDb.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, AuditAction.IntakeAddressCreated));
    expect(entry?.projectId).toBe(projectId);
  });

  it('не создаёт второй адрес при живом первом', async () => {
    await service.createAddress(admin(), projectId);

    await expect(service.createAddress(admin(), projectId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('после отзыва создание разрешено', async () => {
    await service.createAddress(admin(), projectId);
    await service.revokeAddress(admin(), projectId);

    await expect(service.createAddress(admin(), projectId)).resolves.toBeDefined();
  });

  it('находит действующий адрес и не находит отозванный', async () => {
    expect(await service.findAddress(projectId)).toBeNull();

    const token = await service.createAddress(admin(), projectId);
    expect(await service.findAddress(projectId)).toBe(token);

    await service.revokeAddress(admin(), projectId);
    expect(await service.findAddress(projectId)).toBeNull();
  });

  it('отзыв помечает субъект и пишет в журнал', async () => {
    const token = await service.createAddress(admin(), projectId);

    await service.revokeAddress(admin(), projectId);

    const [subject] = await testDb.db.select().from(subjects).where(eq(subjects.label, token));
    expect(subject?.revokedAt).not.toBeNull();

    const [entry] = await testDb.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, AuditAction.IntakeAddressRevoked));
    expect(entry?.projectId).toBe(projectId);
  });

  it('отзыв без адреса отвечает «не найдено»', async () => {
    await expect(service.revokeAddress(admin(), projectId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('разрешает токен в субъект и проект', async () => {
    const token = await service.createAddress(admin(), projectId);

    const resolved = await service.resolveToken(token);

    expect(resolved?.projectId).toBe(projectId);
    expect(resolved?.subject.kind).toBe(SubjectKind.IntakeAddress);
    expect(resolved?.subject.isSuperadmin).toBe(false);
  });

  it('не разрешает мусорный и отозванный токены', async () => {
    expect(await service.resolveToken('несуществующий')).toBeNull();

    const token = await service.createAddress(admin(), projectId);
    await service.revokeAddress(admin(), projectId);

    expect(await service.resolveToken(token)).toBeNull();
  });
});
