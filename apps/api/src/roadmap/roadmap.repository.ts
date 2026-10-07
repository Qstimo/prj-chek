import {
  AccessLevel,
  releaseStatesFor,
  RoadmapVersionState,
  Section,
  type PlatformRelease,
  type PlatformReleaseSet,
  type PublicRoadmap,
  type PublicVersion,
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
  checkpointPlatforms,
  projectPlatforms,
  projects,
  roadmapCheckpoints,
  roadmapPublicLinks,
  roadmapVersions,
  versionPlatformReleases,
  type PlatformReleaseRow,
  type ProjectPlatformRow,
  type RoadmapCheckpointRow,
  type RoadmapVersionRow,
} from '../db/schema';
import { releaseSummaryOf } from './release.summary';
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

    const { versions, byVersion, platforms, releases, byRelease, tags } = await this.loadRoadmap(
      this.db,
      projectId,
    );

    return {
      stage: stageOf(versions),
      versions: versions.map((version) =>
        versionProjection(version, byVersion.get(version.id) ?? [], byRelease.get(version.id) ?? [], level, {
          platformsByCheckpoint: tags,
        }),
      ),
      summary: releaseSummaryOf(platforms, versions, releases),
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
        // `?? null`, а не `input.url`: поле необязательно в схеме создания,
        // и `undefined` заставил бы Drizzle пропустить колонку молча.
        url: input.url ?? null,
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

  /**
   * Ставит выпуск платформы в версии.
   *
   * Строка одна на пару «версия × платформа»: повторный вызов меняет её.
   * Допустимость состояния определяется видом платформы —
   * `releaseStatesFor` из контракта, тот же список, по которому интерфейс
   * рисует выбор.
   *
   * Возвращает строку вместе с именем платформы и обозначением версии:
   * они нужны журналу, а достать их отдельным запросом служба не может —
   * репозиторий платформ требует доступа к «Инфо».
   */
  async setRelease(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    versionId: string,
    platformId: string,
    input: PlatformReleaseSet,
  ): Promise<PlatformReleaseRow & { platformName: string; versionLabel: string }> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);

    const version = await this.requireVersion(tx, projectId, versionId);
    const platform = await this.requirePlatform(tx, projectId, platformId);

    if (!releaseStatesFor(platform.kind).includes(input.state)) {
      throw new ConflictException(
        `Состояние «${input.state}» платформе «${platform.name}» не подходит: модерация и отклонение бывают только у магазина.`,
      );
    }

    const values = {
      versionId,
      platformId,
      state: input.state,
      // `?? null`, а не `input.releasedDate`: Drizzle пропускает
      // `undefined`, и прежняя дата осталась бы в клетке после смены
      // состояния — PUT перестал бы быть полной заменой.
      releasedDate: input.releasedDate ?? null,
      buildLabel: input.buildLabel ?? null,
    };

    const [set] = await tx
      .insert(versionPlatformReleases)
      .values(values)
      .onConflictDoUpdate({
        target: [versionPlatformReleases.versionId, versionPlatformReleases.platformId],
        set: { ...values, updatedAt: new Date() },
      })
      .returning();

    return { ...set!, platformName: platform.name, versionLabel: version.label };
  }

  /**
   * Снимает выпуск: платформа снова идёт «как у версии».
   *
   * Имена берутся из платформы и версии, а не из удаляемой строки,
   * поэтому возвращаются и при повторном вызове. Отсутствие строки
   * ошибкой не считается: «как у версии» и до, и после вызова.
   */
  async clearRelease(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    versionId: string,
    platformId: string,
  ): Promise<{ platformName: string; versionLabel: string }> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);

    const version = await this.requireVersion(tx, projectId, versionId);
    const platform = await this.requirePlatform(tx, projectId, platformId);

    await tx
      .delete(versionPlatformReleases)
      .where(
        and(
          eq(versionPlatformReleases.versionId, versionId),
          eq(versionPlatformReleases.platformId, platformId),
        ),
      );

    return { platformName: platform.name, versionLabel: version.label };
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

    const { versions, byVersion, platforms, releases, byRelease, tags } = await this.loadRoadmap(
      this.db,
      link.projectId,
    );

    return {
      projectName: link.projectName,
      stage: stageOf(versions),
      versions: versions.map(
        (version) =>
          // Без ссылок на задачи: страница открыта без авторизации, и адрес
          // внутреннего трекера с номером задачи наружу уходить не должен.
          versionProjection(
            version,
            byVersion.get(version.id) ?? [],
            byRelease.get(version.id) ?? [],
            AccessLevel.Read,
            { withLinks: false, platformsByCheckpoint: tags },
          ) as PublicVersion,
      ),
      summary: releaseSummaryOf(platforms, versions, releases),
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

    // Платформы читаются таблицей, а не репозиторием платформ: тот
    // проверяет доступ к «Инфо», которого у подрядчика с одним роадмапом
    // нет. Право на эти данные даёт сама секция «Роадмап» (дизайн 9).
    const platformRows = await executor
      .select()
      .from(projectPlatforms)
      .where(eq(projectPlatforms.projectId, projectId))
      .orderBy(asc(projectPlatforms.position), asc(projectPlatforms.createdAt));

    const platforms = platformRows.map((row) => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      position: row.position,
    }));

    const versionIds = versions.map((version) => version.id);

    const releaseRows = versionIds.length
      ? await executor
          .select()
          .from(versionPlatformReleases)
          .where(inArray(versionPlatformReleases.versionId, versionIds))
      : [];

    const releases = releaseRows.map((row) => ({
      versionId: row.versionId,
      platformId: row.platformId,
      state: row.state,
      releasedDate: row.releasedDate,
      buildLabel: row.buildLabel,
    }));

    const byRelease = new Map<string, PlatformRelease[]>();

    for (const release of releases) {
      byRelease.set(release.versionId, [
        ...(byRelease.get(release.versionId) ?? []),
        {
          platformId: release.platformId,
          state: release.state,
          releasedDate: release.releasedDate,
          buildLabel: release.buildLabel,
        },
      ]);
    }

    // Теги сортируются по позиции платформы — тем же порядком, что
    // сводка: иначе чипы у чекпоинта тасовались бы между запросами.
    const checkpointIds = checkpoints.map((checkpoint) => checkpoint.id);

    const tagRows = checkpointIds.length
      ? await executor
          .select({
            checkpointId: checkpointPlatforms.checkpointId,
            platformId: checkpointPlatforms.platformId,
          })
          .from(checkpointPlatforms)
          .innerJoin(projectPlatforms, eq(projectPlatforms.id, checkpointPlatforms.platformId))
          .where(inArray(checkpointPlatforms.checkpointId, checkpointIds))
          .orderBy(asc(projectPlatforms.position), asc(projectPlatforms.createdAt))
      : [];

    const tags = new Map<string, string[]>();

    for (const row of tagRows) {
      tags.set(row.checkpointId, [...(tags.get(row.checkpointId) ?? []), row.platformId]);
    }

    return { versions, byVersion, platforms, releases, byRelease, tags };
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

  /**
   * Платформа обязана принадлежать проекту из адреса.
   *
   * Чужая — `404`, а не `400`: иначе ответ подтвердил бы, что платформа
   * существует в другом проекте.
   */
  private async requirePlatform(
    executor: Executor,
    projectId: string,
    platformId: string,
  ): Promise<ProjectPlatformRow> {
    const [platform] = await executor
      .select()
      .from(projectPlatforms)
      .where(and(eq(projectPlatforms.id, platformId), eq(projectPlatforms.projectId, projectId)))
      .limit(1);

    if (!platform) {
      throw new SectionNotVisibleError();
    }

    return platform;
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
