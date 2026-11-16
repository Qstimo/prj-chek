import { PlatformKind, PlatformReleaseState, SubjectKind } from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { auditLog, projectPlatforms, projects, subjects, users } from '../db/schema';
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

  it('перенос пишет своё действие с обозначениями «откуда» и «куда»', async () => {
    // Общий checkpoint.updated сделал бы перенос неотличимым от
    // переименования, а метаданные записи на экране журнала не видны.
    const from = await service.createVersion(admin(), projectId, { label: 'v1.2' });
    const to = await service.createVersion(admin(), projectId, { label: 'v1.3' });
    const checkpoint = await service.createCheckpoint(admin(), projectId, from.id, {
      title: 'Оплата',
    });

    await service.carryOverCheckpoint(admin(), projectId, from.id, checkpoint.id, {
      targetVersionId: to.id,
    });

    const [entry] = await entriesOf(AuditAction.CheckpointCarriedOver);

    expect(entry?.metadata).toMatchObject({ title: 'Оплата', from: 'v1.2', to: 'v1.3' });
    expect(entry?.entityId).toBe(checkpoint.id);
    expect(entry?.projectId).toBe(projectId);

    // Переименованием перенос не прикидывается.
    expect(await entriesOf(AuditAction.CheckpointUpdated)).toHaveLength(0);
  });

  it('отказ переноса не оставляет записи и не создаёт версию', async () => {
    const from = await service.createVersion(admin(), projectId, { label: 'v1.2' });
    await service.createVersion(admin(), projectId, { label: 'v1.3' });
    const checkpoint = await service.createCheckpoint(admin(), projectId, from.id, {
      title: 'Оплата',
    });

    await expect(
      service.carryOverCheckpoint(admin(), projectId, from.id, checkpoint.id, {
        newVersionLabel: 'v1.3',
      }),
    ).rejects.toThrow();

    expect(await entriesOf(AuditAction.CheckpointCarriedOver)).toHaveLength(0);
  });

  it('публикация и отключение отчёта попадают в журнал своими действиями', async () => {
    // Отдельные действия, а не общие с роадмапом: ссылка на отчёт
    // раскрывает одну версию, и по журналу обязано быть видно какую.
    const version = await service.createVersion(admin(), projectId, { label: 'v1.2' });

    await service.publishReport(admin(), projectId, version.id);
    await service.unpublishReport(admin(), projectId, version.id);

    const [published] = await entriesOf(AuditAction.ReleaseReportPublished);
    const [unpublished] = await entriesOf(AuditAction.ReleaseReportUnpublished);

    expect(published?.entityType).toBe('release_report_public_link');
    expect(published?.entityId).toBe(version.id);
    expect(published?.projectId).toBe(projectId);
    expect(published?.metadata).toMatchObject({ label: 'v1.2' });
    expect(unpublished?.metadata).toMatchObject({ label: 'v1.2' });

    // Публикацией роадмапа отчёт не прикидывается.
    expect(await entriesOf(AuditAction.RoadmapPublished)).toHaveLength(0);
  });

  it('токен ссылки на отчёт в журнал не пишется', async () => {
    // Токен — сам секрет ссылки: журнал читают шире, чем рассылают
    // ссылку, и запись токена раскрыла бы отчёт всем читателям журнала.
    const version = await service.createVersion(admin(), projectId, { label: 'v1.2' });

    const token = await service.publishReport(admin(), projectId, version.id);

    const [published] = await entriesOf(AuditAction.ReleaseReportPublished);

    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(JSON.stringify(published)).not.toContain(token);
  });

  it('отказ публикации отчёта не оставляет записи', async () => {
    const version = await service.createVersion(admin(), projectId, { label: 'v1.2' });
    await service.publishReport(admin(), projectId, version.id);

    await expect(service.publishReport(admin(), projectId, version.id)).rejects.toThrow();

    expect(await entriesOf(AuditAction.ReleaseReportPublished)).toHaveLength(1);
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

  it('пишет постановку и снятие выпуска в журнал', async () => {
    const version = await service.createVersion(admin(), projectId, { label: 'v1.0' });
    // Вид обязательно «магазин»: у серверной платформы модерации
    // не бывает, и тест упал бы на отказе вместо проверки журнала.
    const [platform] = await testDb.db
      .insert(projectPlatforms)
      .values({ projectId, name: 'App Store', kind: PlatformKind.Store, position: 1 })
      .returning();

    await service.setRelease(admin(), projectId, version.id, platform!.id, {
      state: PlatformReleaseState.InReview,
    });

    const [set] = await entriesOf(AuditAction.PlatformReleaseSet);

    expect(set?.metadata).toMatchObject({
      state: PlatformReleaseState.InReview,
      platform: 'App Store',
      label: 'v1.0',
    });

    await service.clearRelease(admin(), projectId, version.id, platform!.id);

    const [cleared] = await entriesOf(AuditAction.PlatformReleaseCleared);

    expect(cleared?.metadata).toMatchObject({ platform: 'App Store', label: 'v1.0' });
  });
});
