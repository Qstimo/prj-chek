import {
  AccessLevel,
  RoadmapVersionState,
  Section,
  type PublicRoadmap,
  type RoadmapCheckpointCreate,
  type RoadmapCheckpointUpdate,
  type RoadmapResponse,
  type RoadmapStage,
  type RoadmapVersionCreate,
  type RoadmapVersionDetail,
  type RoadmapVersionUpdate,
} from '@cairn/shared';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';

import { SectionNotVisibleError } from '../access/access.errors';
import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { generateToken } from '../auth/token';
import { DATABASE } from '../db/db.module';
import type { Database, Executor, Transaction } from '../db/db.types';
import {
  projects,
  roadmapCheckpoints,
  roadmapPublicLinks,
  roadmapVersions,
  type RoadmapCheckpointRow,
  type RoadmapVersionRow,
} from '../db/schema';
import { versionProjection } from './roadmap.projection';

/**
 * Доступ к роадмапу (ТЗ 3.5).
 *
 * Каждый метод с субъектом проверяет права сам (спека 5.4). Публичный путь
 * работает только через токен из `roadmap_public_links`: строка есть —
 * опубликовано, строки нет — закрыто, третьего состояния не бывает.
 */
@Injectable()
export class RoadmapRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly access: AccessService,
  ) {}

  /** Роадмап проекта в проекции по уровню, со стадией. */
  async findForProject(subject: RequestSubject, projectId: string): Promise<RoadmapResponse> {
    const level = await this.access.requireLevel(
      subject,
      projectId,
      Section.Roadmap,
      AccessLevel.Metadata,
    );

    const { versions, byVersion } = await this.loadRoadmap(this.db, projectId);

    return {
      stage: stageOf(versions),
      versions: versions.map((version) =>
        versionProjection(version, byVersion.get(version.id) ?? [], level),
      ),
    };
  }

  /** Создаёт версию в конце последовательности. */
  async createVersion(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    input: RoadmapVersionCreate,
  ): Promise<RoadmapVersionRow> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);

    const existing = await tx
      .select({ position: roadmapVersions.position, label: roadmapVersions.label })
      .from(roadmapVersions)
      .where(eq(roadmapVersions.projectId, projectId));

    // Ограничение уникальности есть и в базе, но человеку нужен внятный
    // отказ, а не 500 от сырого нарушения ключа.
    if (existing.some((row) => row.label === input.label)) {
      throw new ConflictException('Версия с таким обозначением уже есть в роадмапе.');
    }

    const [created] = await tx
      .insert(roadmapVersions)
      .values({
        projectId,
        label: input.label,
        plannedDate: input.plannedDate ?? null,
        releasedDate: input.releasedDate ?? null,
        state: input.state ?? RoadmapVersionState.Planned,
        position: Math.max(0, ...existing.map((row) => row.position)) + 1,
      })
      .returning();

    return created!;
  }

  /** Правит версию: паспорт, состояние, позицию. */
  async updateVersion(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    versionId: string,
    input: RoadmapVersionUpdate,
  ): Promise<RoadmapVersionRow> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);
    await this.requireVersion(tx, projectId, versionId);

    if (input.label !== undefined) {
      const [duplicate] = await tx
        .select({ id: roadmapVersions.id })
        .from(roadmapVersions)
        .where(
          and(eq(roadmapVersions.projectId, projectId), eq(roadmapVersions.label, input.label)),
        )
        .limit(1);

      if (duplicate && duplicate.id !== versionId) {
        throw new ConflictException('Версия с таким обозначением уже есть в роадмапе.');
      }
    }

    const [updated] = await tx
      .update(roadmapVersions)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(roadmapVersions.id, versionId))
      .returning();

    return updated!;
  }

  /** Удаляет версию вместе с чекпоинтами — явной строкой, без каскада. */
  async removeVersion(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    versionId: string,
  ): Promise<RoadmapVersionRow> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);

    const version = await this.requireVersion(tx, projectId, versionId);

    await tx.delete(roadmapCheckpoints).where(eq(roadmapCheckpoints.versionId, versionId));
    await tx.delete(roadmapVersions).where(eq(roadmapVersions.id, versionId));

    return version;
  }

  /** Создаёт чекпоинт в конце списка версии. */
  async createCheckpoint(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    versionId: string,
    input: RoadmapCheckpointCreate,
  ): Promise<RoadmapCheckpointRow> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);
    await this.requireVersion(tx, projectId, versionId);

    const existing = await tx
      .select({ position: roadmapCheckpoints.position })
      .from(roadmapCheckpoints)
      .where(eq(roadmapCheckpoints.versionId, versionId));

    const [created] = await tx
      .insert(roadmapCheckpoints)
      .values({
        versionId,
        title: input.title,
        position: Math.max(0, ...existing.map((row) => row.position)) + 1,
      })
      .returning();

    return created!;
  }

  /** Правит чекпоинт: формулировку, признак, позицию. */
  async updateCheckpoint(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    versionId: string,
    checkpointId: string,
    input: RoadmapCheckpointUpdate,
  ): Promise<RoadmapCheckpointRow> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);
    await this.requireCheckpoint(tx, projectId, versionId, checkpointId);

    const [updated] = await tx
      .update(roadmapCheckpoints)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(roadmapCheckpoints.id, checkpointId))
      .returning();

    return updated!;
  }

  /** Удаляет чекпоинт. */
  async removeCheckpoint(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    versionId: string,
    checkpointId: string,
  ): Promise<RoadmapCheckpointRow> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);

    const checkpoint = await this.requireCheckpoint(tx, projectId, versionId, checkpointId);

    await tx.delete(roadmapCheckpoints).where(eq(roadmapCheckpoints.id, checkpointId));

    return checkpoint;
  }

  /** Токен действующей публичной ссылки либо `null`. */
  async findPublicLink(projectId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ token: roadmapPublicLinks.token })
      .from(roadmapPublicLinks)
      .where(eq(roadmapPublicLinks.projectId, projectId))
      .limit(1);

    return row?.token ?? null;
  }

  /** Включает публикацию. Повторное включение — конфликт. */
  async publish(tx: Transaction, projectId: string): Promise<string> {
    const [existing] = await tx
      .select({ id: roadmapPublicLinks.id })
      .from(roadmapPublicLinks)
      .where(eq(roadmapPublicLinks.projectId, projectId))
      .limit(1);

    if (existing) {
      throw new ConflictException('Роадмап уже опубликован. Сначала отключите ссылку.');
    }

    const token = generateToken();

    await tx.insert(roadmapPublicLinks).values({ projectId, token });

    return token;
  }

  /** Отключает публикацию: прежняя ссылка гаснет. */
  async unpublish(tx: Transaction, projectId: string): Promise<void> {
    const [existing] = await tx
      .select({ id: roadmapPublicLinks.id })
      .from(roadmapPublicLinks)
      .where(eq(roadmapPublicLinks.projectId, projectId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Роадмап не опубликован');
    }

    await tx.delete(roadmapPublicLinks).where(eq(roadmapPublicLinks.id, existing.id));
  }

  /**
   * Публичный роадмап по токену: полная проекция чтения без субъекта.
   *
   * Мусорный токен и отключённая публикация неразличимы — `null`,
   * снаружи одинаковый `404`.
   */
  async publicRoadmap(token: string): Promise<PublicRoadmap | null> {
    const [link] = await this.db
      .select({ projectId: roadmapPublicLinks.projectId, projectName: projects.name })
      .from(roadmapPublicLinks)
      .innerJoin(projects, eq(projects.id, roadmapPublicLinks.projectId))
      .where(eq(roadmapPublicLinks.token, token))
      .limit(1);

    if (!link) {
      return null;
    }

    const { versions, byVersion } = await this.loadRoadmap(this.db, link.projectId);

    return {
      projectName: link.projectName,
      stage: stageOf(versions),
      versions: versions.map(
        (version) =>
          versionProjection(
            version,
            byVersion.get(version.id) ?? [],
            AccessLevel.Read,
          ) as RoadmapVersionDetail,
      ),
    };
  }

  /** Версии проекта с чекпоинтами, всё по порядку позиций. */
  private async loadRoadmap(executor: Executor, projectId: string) {
    const versions = await executor
      .select()
      .from(roadmapVersions)
      .where(eq(roadmapVersions.projectId, projectId))
      .orderBy(asc(roadmapVersions.position), asc(roadmapVersions.createdAt));

    const checkpoints = versions.length
      ? await executor
          .select()
          .from(roadmapCheckpoints)
          .where(
            inArray(
              roadmapCheckpoints.versionId,
              versions.map((version) => version.id),
            ),
          )
          .orderBy(asc(roadmapCheckpoints.position), asc(roadmapCheckpoints.createdAt))
      : [];

    const byVersion = new Map<string, RoadmapCheckpointRow[]>();

    for (const checkpoint of checkpoints) {
      byVersion.set(checkpoint.versionId, [
        ...(byVersion.get(checkpoint.versionId) ?? []),
        checkpoint,
      ]);
    }

    return { versions, byVersion };
  }

  /** Версия обязана принадлежать проекту из адреса. */
  private async requireVersion(
    executor: Executor,
    projectId: string,
    versionId: string,
  ): Promise<RoadmapVersionRow> {
    const [version] = await executor
      .select()
      .from(roadmapVersions)
      .where(and(eq(roadmapVersions.id, versionId), eq(roadmapVersions.projectId, projectId)))
      .limit(1);

    if (!version) {
      throw new SectionNotVisibleError();
    }

    return version;
  }

  /** Чекпоинт обязан принадлежать версии и проекту из адреса. */
  private async requireCheckpoint(
    executor: Executor,
    projectId: string,
    versionId: string,
    checkpointId: string,
  ): Promise<RoadmapCheckpointRow> {
    await this.requireVersion(executor, projectId, versionId);

    const [checkpoint] = await executor
      .select()
      .from(roadmapCheckpoints)
      .where(
        and(eq(roadmapCheckpoints.id, checkpointId), eq(roadmapCheckpoints.versionId, versionId)),
      )
      .limit(1);

    if (!checkpoint) {
      throw new SectionNotVisibleError();
    }

    return checkpoint;
  }
}

/**
 * Стадия проекта — позиция текущей версии (ТЗ 3.5): первая в работе,
 * иначе первая запланированная, все выпущены — последняя.
 */
function stageOf(versions: RoadmapVersionRow[]): RoadmapStage {
  if (versions.length === 0) {
    return { current: null, total: 0 };
  }

  const indexOf = (state: RoadmapVersionState) =>
    versions.findIndex((version) => version.state === state);

  const inProgress = indexOf(RoadmapVersionState.InProgress);
  const planned = indexOf(RoadmapVersionState.Planned);
  const current = inProgress !== -1 ? inProgress : planned !== -1 ? planned : versions.length - 1;

  return { current: current + 1, total: versions.length };
}
