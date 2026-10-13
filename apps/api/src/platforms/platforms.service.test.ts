import { PlatformKind, PlatformReleaseState, SubjectKind } from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import {
  auditLog,
  projectPlatforms,
  projects,
  roadmapVersions,
  subjects,
  users,
  versionPlatformReleases,
} from '../db/schema';
import { PlatformsRepository } from './platforms.repository';
import { PlatformsService } from './platforms.service';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('сервис платформ', () => {
  let testDb: TestDatabase;
  let service: PlatformsService;
  let projectId: string;
  let adminSubjectId: string;
  let memberSubjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new PlatformsService(
      testDb.db,
      new PlatformsRepository(testDb.db, new AccessService(testDb.db)),
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

    // Не-суперадмин: образец-тест роадмапа такого субъекта не держит.
    const [memberSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    memberSubjectId = memberSubject!.id;
    await testDb.db
      .insert(users)
      .values({ subjectId: memberSubjectId, email: 'user@cairn.local', passwordHash: 'хэш' });

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

  const member = (): RequestSubject => ({
    id: memberSubjectId,
    kind: SubjectKind.User,
    label: 'user@cairn.local',
    isSuperadmin: false,
    isRevoked: false,
  });

  async function entriesOf(action: AuditAction) {
    return testDb.db.select().from(auditLog).where(eq(auditLog.action, action));
  }

  it('пишет заведение платформы в журнал', async () => {
    await service.create(admin(), projectId, { kind: PlatformKind.Store, name: 'RuStore' });

    const [entry] = await entriesOf(AuditAction.PlatformCreated);

    expect(entry?.metadata).toMatchObject({ name: 'RuStore' });
  });

  it('пишет правку имени', async () => {
    const created = await service.create(admin(), projectId, {
      kind: PlatformKind.Server,
      name: 'Веб',
    });

    await service.update(admin(), projectId, created.id, { name: 'Веб-админка' });

    const [entry] = await entriesOf(AuditAction.PlatformUpdated);

    expect(entry?.metadata).toMatchObject({ name: 'Веб-админка' });
  });

  it('помнит имя удалённой платформы', async () => {
    // После удаления имя взять уже негде, а запись в журнале без имени
    // ссылается на то, чего не найти.
    const created = await service.create(admin(), projectId, {
      kind: PlatformKind.Server,
      name: 'API',
    });

    await service.remove(admin(), projectId, created.id);

    const [entry] = await entriesOf(AuditAction.PlatformDeleted);

    expect(entry?.metadata).toMatchObject({ name: 'API', releases: 0 });
    expect(await testDb.rowsOf(projectPlatforms)).toHaveLength(0);
  });

  it('называет число выпусков, унесённых удалением платформы', async () => {
    // Удаление платформы — штатный способ сменить её вид, и единственный
    // след унесённых дат релизов остаётся в журнале.
    const created = await service.create(admin(), projectId, {
      kind: PlatformKind.Store,
      name: 'App Store',
    });
    const [version] = await testDb.db
      .insert(roadmapVersions)
      .values({ projectId, label: 'v1.0', position: 1 })
      .returning();
    await testDb.db.insert(versionPlatformReleases).values({
      versionId: version!.id,
      platformId: created.id,
      state: PlatformReleaseState.Released,
      releasedDate: '2026-03-16',
    });

    await service.remove(admin(), projectId, created.id);

    const [entry] = await entriesOf(AuditAction.PlatformDeleted);

    expect(entry?.metadata).toMatchObject({ name: 'App Store', releases: 1 });
  });

  it('при отказе в правах ничего не пишет', async () => {
    await expect(
      service.create(member(), projectId, { kind: PlatformKind.Server, name: 'API' }),
    ).rejects.toThrow();

    expect(await entriesOf(AuditAction.PlatformCreated)).toHaveLength(0);
  });
});
