import {
  AuditSubjectKind,
  type CheckpointCarryOver,
  type PlatformRelease,
  type PlatformReleaseSet,
  type PublicReleaseReport,
  type PublicRoadmap,
  type ReleaseReport,
  type RoadmapCheckpointCreate,
  type RoadmapCheckpointUpdate,
  type RoadmapResponse,
  type RoadmapVersionCreate,
  type RoadmapVersionUpdate,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import type { RoadmapCheckpointRow, RoadmapVersionRow } from '../db/schema';
import {
  RoadmapRepository,
  type CarriedOverCheckpoint,
  type TaggedCheckpointRow,
} from './roadmap.repository';

/**
 * Роадмап: изменения вместе с журналированием.
 *
 * Формулировки чекпоинтов попадают в журнал — в отличие от значений
 * переменных они не секрет. Публичное чтение журнала не оставляет:
 * у анонимного читателя нет субъекта.
 */
@Injectable()
export class RoadmapService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: RoadmapRepository,
    private readonly audit: AuditService,
  ) {}

  /** Роадмап проекта по уровню доступа. */
  async get(subject: RequestSubject, projectId: string): Promise<RoadmapResponse> {
    return this.repository.findForProject(subject, projectId);
  }

  /** Публичный роадмап по токену. */
  async publicRoadmap(token: string): Promise<PublicRoadmap | null> {
    return this.repository.publicRoadmap(token);
  }

  /** Токен публичной ссылки проекта либо `null`. */
  async findPublicLink(subject: RequestSubject, projectId: string): Promise<string | null> {
    return this.repository.findPublicLink(subject, projectId);
  }

  /** Отчёт по релизу версии. */
  async report(
    subject: RequestSubject,
    projectId: string,
    versionId: string,
  ): Promise<ReleaseReport> {
    return this.repository.findReport(subject, projectId, versionId);
  }

  /** Публичный отчёт по токену. */
  async publicReport(token: string): Promise<PublicReleaseReport | null> {
    return this.repository.publicReport(token);
  }

  /** Токен публичной ссылки на отчёт версии либо `null`. */
  async findReportLink(
    subject: RequestSubject,
    projectId: string,
    versionId: string,
  ): Promise<string | null> {
    return this.repository.findReportLink(subject, projectId, versionId);
  }

  /**
   * Включает публикацию отчёта версии и возвращает токен.
   *
   * Своё действие журнала, а не общее с роадмапом: наружу открывается
   * одна версия, и по журналу обязано быть видно какая. Сам токен в
   * запись не попадает — журнал читают шире, чем рассылают ссылку.
   */
  async publishReport(
    subject: RequestSubject,
    projectId: string,
    versionId: string,
  ): Promise<string> {
    return this.db.transaction(async (tx) => {
      const published = await this.repository.publishReport(subject, tx, projectId, versionId);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.ReleaseReportPublished,
        entityType: 'release_report_public_link',
        // Отчёт опознаётся версией: своего идентификатора у него нет, а
        // идентификатор строки ссылки после отключения ни на что не
        // указывает.
        entityId: versionId,
        projectId,
        metadata: { label: published.label },
      });

      return published.token;
    });
  }

  /** Отключает публикацию отчёта: прежняя ссылка гаснет. */
  async unpublishReport(
    subject: RequestSubject,
    projectId: string,
    versionId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const unpublished = await this.repository.unpublishReport(subject, tx, projectId, versionId);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.ReleaseReportUnpublished,
        entityType: 'release_report_public_link',
        entityId: versionId,
        projectId,
        metadata: { label: unpublished.label },
      });
    });
  }

  /** Создаёт версию. */
  async createVersion(
    subject: RequestSubject,
    projectId: string,
    input: RoadmapVersionCreate,
  ): Promise<RoadmapVersionRow> {
    return this.db.transaction(async (tx) => {
      const created = await this.repository.createVersion(subject, tx, projectId, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.RoadmapVersionCreated,
        entityType: 'roadmap_version',
        entityId: created.id,
        projectId,
        metadata: { label: created.label },
      });

      return created;
    });
  }

  /** Правит версию. */
  async updateVersion(
    subject: RequestSubject,
    projectId: string,
    versionId: string,
    input: RoadmapVersionUpdate,
  ): Promise<RoadmapVersionRow> {
    return this.db.transaction(async (tx) => {
      const updated = await this.repository.updateVersion(subject, tx, projectId, versionId, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.RoadmapVersionUpdated,
        entityType: 'roadmap_version',
        entityId: versionId,
        projectId,
        metadata: { label: updated.label, fields: Object.keys(input) },
      });

      return updated;
    });
  }

  /** Удаляет версию вместе с чекпоинтами. */
  async removeVersion(
    subject: RequestSubject,
    projectId: string,
    versionId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const removed = await this.repository.removeVersion(subject, tx, projectId, versionId);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.RoadmapVersionDeleted,
        entityType: 'roadmap_version',
        entityId: versionId,
        projectId,
        metadata: { label: removed.label },
      });
    });
  }

  /** Создаёт чекпоинт. */
  async createCheckpoint(
    subject: RequestSubject,
    projectId: string,
    versionId: string,
    input: RoadmapCheckpointCreate,
  ): Promise<TaggedCheckpointRow> {
    return this.db.transaction(async (tx) => {
      const created = await this.repository.createCheckpoint(
        subject,
        tx,
        projectId,
        versionId,
        input,
      );

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.CheckpointCreated,
        entityType: 'checkpoint',
        entityId: created.id,
        projectId,
        metadata: { title: created.title },
      });

      return created;
    });
  }

  /** Правит чекпоинт. */
  async updateCheckpoint(
    subject: RequestSubject,
    projectId: string,
    versionId: string,
    checkpointId: string,
    input: RoadmapCheckpointUpdate,
  ): Promise<TaggedCheckpointRow> {
    return this.db.transaction(async (tx) => {
      const updated = await this.repository.updateCheckpoint(
        subject,
        tx,
        projectId,
        versionId,
        checkpointId,
        input,
      );

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.CheckpointUpdated,
        entityType: 'checkpoint',
        entityId: checkpointId,
        projectId,
        metadata: { title: updated.title, fields: Object.keys(input) },
      });

      return updated;
    });
  }

  /**
   * Переносит чекпоинт в другую версию.
   *
   * Своё действие журнала, а не `checkpoint.updated`: с общим действием
   * перенос был бы неотличим от переименования, а метаданные записи на
   * экране журнала не показываются.
   */
  async carryOverCheckpoint(
    subject: RequestSubject,
    projectId: string,
    versionId: string,
    checkpointId: string,
    input: CheckpointCarryOver,
  ): Promise<CarriedOverCheckpoint> {
    return this.db.transaction(async (tx) => {
      const carried = await this.repository.carryOverCheckpoint(
        subject,
        tx,
        projectId,
        versionId,
        checkpointId,
        input,
      );

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.CheckpointCarriedOver,
        entityType: 'checkpoint',
        entityId: checkpointId,
        projectId,
        metadata: {
          title: carried.checkpoint.title,
          from: carried.fromLabel,
          to: carried.toLabel,
        },
      });

      return carried;
    });
  }

  /** Удаляет чекпоинт. */
  async removeCheckpoint(
    subject: RequestSubject,
    projectId: string,
    versionId: string,
    checkpointId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const removed = await this.repository.removeCheckpoint(
        subject,
        tx,
        projectId,
        versionId,
        checkpointId,
      );

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.CheckpointDeleted,
        entityType: 'checkpoint',
        entityId: checkpointId,
        projectId,
        metadata: { title: removed.title },
      });
    });
  }

  /** Ставит выпуск платформы в версии. */
  async setRelease(
    subject: RequestSubject,
    projectId: string,
    versionId: string,
    platformId: string,
    input: PlatformReleaseSet,
  ): Promise<PlatformRelease> {
    return this.db.transaction(async (tx) => {
      const set = await this.repository.setRelease(
        subject,
        tx,
        projectId,
        versionId,
        platformId,
        input,
      );

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.PlatformReleaseSet,
        entityType: 'platform_release',
        entityId: set.id,
        projectId,
        metadata: { label: set.versionLabel, platform: set.platformName, state: set.state },
      });

      return {
        platformId: set.platformId,
        state: set.state,
        releasedDate: set.releasedDate,
        buildLabel: set.buildLabel,
      };
    });
  }

  /** Снимает выпуск: платформа снова идёт «как у версии». */
  async clearRelease(
    subject: RequestSubject,
    projectId: string,
    versionId: string,
    platformId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const cleared = await this.repository.clearRelease(
        subject,
        tx,
        projectId,
        versionId,
        platformId,
      );

      await this.audit.record(tx, actorOf(subject), {
        // `entityId` не заполняется: строки выпуска после снятия уже нет.
        action: AuditAction.PlatformReleaseCleared,
        entityType: 'platform_release',
        projectId,
        metadata: { label: cleared.versionLabel, platform: cleared.platformName },
      });
    });
  }

  /** Включает публикацию и возвращает токен. */
  async publish(subject: RequestSubject, projectId: string): Promise<string> {
    return this.db.transaction(async (tx) => {
      const token = await this.repository.publish(subject, tx, projectId);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.RoadmapPublished,
        entityType: 'roadmap_public_link',
        projectId,
      });

      return token;
    });
  }

  /** Отключает публикацию: прежняя ссылка гаснет. */
  async unpublish(subject: RequestSubject, projectId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.repository.unpublish(subject, tx, projectId);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.RoadmapUnpublished,
        entityType: 'roadmap_public_link',
        projectId,
      });
    });
  }
}

/** Строит действующее лицо журнала из субъекта запроса. */
function actorOf(subject: RequestSubject): AuditActor {
  return {
    kind: subject.kind as unknown as Exclude<AuditSubjectKind, AuditSubjectKind.System>,
    id: subject.id,
    label: subject.label,
  };
}
