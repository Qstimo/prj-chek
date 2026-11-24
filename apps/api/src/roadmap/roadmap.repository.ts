import {
  AccessLevel,
  CARRY_OVER_NEEDS_LABEL,
  PlatformReleaseState,
  releaseStatesFor,
  RoadmapVersionState,
  Section,
  type CarriedOutCheckpoint,
  type CheckpointCarryOver,
  type Platform,
  type PlatformRelease,
  type PlatformReleaseSet,
  type PublicReleaseReport,
  type PublicRoadmap,
  type PublicVersion,
  type ReleaseReport,
  type RoadmapCheckpointCreate,
  type RoadmapCheckpointUpdate,
  type RoadmapResponse,
  type RoadmapStage,
  type RoadmapVersionCreate,
  type RoadmapVersionDetail,
  type RoadmapVersionUpdate,
  TaskOrigin,
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
  projectTaskPlatforms,
  projectTasks,
  projectPlatforms,
  projects,
  roadmapCheckpoints,
  roadmapPublicLinks,
  roadmapReportPublicLinks,
  roadmapVersions,
  versionPlatformReleases,
  type PlatformReleaseRow,
  type ProjectPlatformRow,
  type RoadmapCheckpointRow,
  type RoadmapVersionRow,
} from '../db/schema';
import { TaskAlreadyPlacedError } from '../tasks/tasks.errors';
import { releaseReportOf } from './release.report';
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

  /**
   * Роадмап проекта в проекции по уровню, со стадией.
   *
   * `withLinks` выключается вызывающей стороной, когда выдача уезжает
   * туда, где адреса внутреннего трекера быть не должно, — например
   * агенту MCP: ссылка с номером задачи попала бы в контекст модели.
   */
  async findForProject(
    subject: RequestSubject,
    projectId: string,
    { withLinks = true }: { withLinks?: boolean } = {},
  ): Promise<RoadmapResponse> {
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
          withLinks,
          platformsByCheckpoint: tags,
        }),
      ),
      summary: releaseSummaryOf(platforms, versions, releases),
    };
  }

  /**
   * Обозначения версий проекта с их позициями.
   *
   * Нужен подсказке следующего обозначения в конструкторе задач: собирать
   * весь роадмап с чекпоинтами, выпусками и сводкой ради двух колонок
   * незачем. Уровня «метаданные» достаточно — обозначения версий видны
   * уже на нём (ТЗ 4.3).
   */
  async labelsForProject(
    subject: RequestSubject,
    projectId: string,
    executor: Executor = this.db,
  ): Promise<{ label: string; position: number }[]> {
    await this.access.requireLevel(
      subject,
      projectId,
      Section.Roadmap,
      AccessLevel.Metadata,
      executor,
    );

    return executor
      .select({ label: roadmapVersions.label, position: roadmapVersions.position })
      .from(roadmapVersions)
      .where(eq(roadmapVersions.projectId, projectId))
      .orderBy(asc(roadmapVersions.position));
  }

  /**
   * Платформы проекта с их порядком.
   *
   * Нужен чипам тегов в редакторе черновика саммари: собирать весь роадмап
   * с версиями, чекпоинтами и сводкой ради списка имён незачем — тот же
   * довод, по которому рядом живёт {@link labelsForProject}.
   *
   * Уровня «метаданные» достаточно, и это не послабление: сводка релизов,
   * которую `findForProject` отдаёт под тем же уровнем, уже несёт каждую
   * платформу проекта целиком, а публичная страница роадмапа — и вовсе без
   * авторизации. «Инфо» владеет правкой платформ и паспортом, а не знанием
   * о списке (дизайн, 3.1).
   *
   * Порядок — `position`, затем `createdAt`: тот же, в котором платформы
   * читает сводка. Второй порядок разошёлся бы с первым.
   */
  async platformsForProject(
    subject: RequestSubject,
    projectId: string,
    executor: Executor = this.db,
  ): Promise<Platform[]> {
    await this.access.requireLevel(
      subject,
      projectId,
      Section.Roadmap,
      AccessLevel.Metadata,
      executor,
    );

    const rows = await executor
      .select()
      .from(projectPlatforms)
      .where(eq(projectPlatforms.projectId, projectId))
      .orderBy(asc(projectPlatforms.position), asc(projectPlatforms.createdAt));

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      position: row.position,
    }));
  }

  /** Создаёт версию в конце последовательности. */
  async createVersion(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    input: RoadmapVersionCreate,
  ): Promise<RoadmapVersionRow> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);
    await this.lockProject(tx, projectId);
    await this.requireDateFromReleases(tx, projectId, input);

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
    await this.lockProject(tx, projectId);
    await this.requireVersion(tx, projectId, versionId);
    await this.requireDateFromReleases(tx, projectId, input);

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
    await this.lockProject(tx, projectId);

    const version = await this.requireVersion(tx, projectId, versionId);

    // Порядок обратен ссылкам: сначала выпуски, затем размещения и сама
    // версия. На всех ссылках `restrict`, и без уборки удаление упёрлось
    // бы в целостность.
    //
    // Теги здесь больше не трогаются: они висят на задаче, а задача
    // переживает версию — удаление версии **вынимает** её задачи из
    // роадмапа, а не стирает формулировки. Прежде стирало: формулировка
    // жила в этой строке, и другого места у неё не было.
    await tx
      .delete(versionPlatformReleases)
      .where(eq(versionPlatformReleases.versionId, versionId));
    // Публичная ссылка на отчёт тоже висит на версии и тоже `restrict`:
    // без уборки версия с опубликованным отчётом стала бы неудаляемой.
    await tx
      .delete(roadmapReportPublicLinks)
      .where(eq(roadmapReportPublicLinks.versionId, versionId));
    await tx.delete(roadmapCheckpoints).where(eq(roadmapCheckpoints.versionId, versionId));
    await tx.delete(roadmapVersions).where(eq(roadmapVersions.id, versionId));

    return version;
  }

  /** Получатель задач саммари под тем же правом, что создание чекпоинта. */
  async releaseTarget(subject: RequestSubject, tx: Transaction, projectId: string, versionId: string) {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);
    await this.lockProject(tx, projectId);
    return this.requireVersion(tx, projectId, versionId);
  }

  /** Создаёт чекпоинт в конце списка версии. */
  async createCheckpoint(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    versionId: string,
    input: RoadmapCheckpointCreate,
  ): Promise<TaggedCheckpointRow> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);
    await this.lockProject(tx, projectId);
    await this.requireVersion(tx, projectId, versionId);

    const existing = await tx
      .select({ position: roadmapCheckpoints.position })
      .from(roadmapCheckpoints)
      .where(eq(roadmapCheckpoints.versionId, versionId));

    // Две формы одного действия: положить в версию существующую задачу
    // реестра или завести новую вместе с размещением. Ветвление по
    // наличию поля, а не по флагу: контракт отвергает тело с обоими.
    const taskId =
      'taskId' in input
        ? await this.requirePlaceableTask(tx, projectId, input.taskId)
        : await this.createTaskForCheckpoint(tx, projectId, input);

    const [created] = await tx
      .insert(roadmapCheckpoints)
      .values({
        versionId,
        taskId,
        position: Math.max(0, ...existing.map((row) => row.position)) + 1,
      })
      .returning();

    return this.taggedOf(tx, created!);
  }

  /**
   * Задача, которую можно положить в версию, либо отказ.
   *
   * Два условия, и оба — отказ, а не молчание: задача чужого проекта не
   * раскрывается вовсе (`404`, как любая невидимая строка), а занятая
   * задача получает свой код — её уже держит другая версия, и второе
   * размещение означало бы двойное «сделано» у одного факта.
   */
  private async requirePlaceableTask(
    tx: Transaction,
    projectId: string,
    taskId: string,
  ): Promise<string> {
    const [task] = await tx
      .select({ id: projectTasks.id })
      .from(projectTasks)
      .where(and(eq(projectTasks.id, taskId), eq(projectTasks.projectId, projectId)))
      .limit(1);

    if (!task) {
      throw new SectionNotVisibleError();
    }

    const [placed] = await tx
      .select({ id: roadmapCheckpoints.id })
      .from(roadmapCheckpoints)
      .where(eq(roadmapCheckpoints.taskId, taskId))
      .limit(1);

    if (placed) {
      throw new TaskAlreadyPlacedError();
    }

    return task.id;
  }

  /**
   * Заводит задачу под новое размещение.
   *
   * `origin: roadmap` — задача пришла этим путём, и признак нужен экрану
   * задач: «заведена в версии» отличается от «приехала из созвона».
   */
  private async createTaskForCheckpoint(
    tx: Transaction,
    projectId: string,
    input: { title: string; url?: string | null; platformIds?: string[] },
  ): Promise<string> {
    const [task] = await tx
      .insert(projectTasks)
      .values({
        projectId,
        title: input.title,
        // `?? null`, а не `input.url`: поле необязательно в схеме создания,
        // и `undefined` заставил бы Drizzle пропустить колонку молча.
        url: input.url ?? null,
        origin: TaskOrigin.Roadmap,
      })
      .returning();

    if (input.platformIds) {
      await this.replaceTaskPlatforms(tx, projectId, task!.id, input.platformIds);
    }

    return task!.id;
  }

  /** Правит размещение: признак «закрыт» и позицию в версии. */
  async updateCheckpoint(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    versionId: string,
    checkpointId: string,
    input: RoadmapCheckpointUpdate,
  ): Promise<TaggedCheckpointRow> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);
    await this.lockProject(tx, projectId);
    await this.requireCheckpoint(tx, projectId, versionId, checkpointId);

    const [updated] = await tx
      .update(roadmapCheckpoints)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(roadmapCheckpoints.id, checkpointId))
      .returning();

    // Формулировка, ссылка и теги читаются из задачи, а не берутся из
    // тела: эта ручка их не правит вовсе, а ответ обязан описать
    // состояние после операции целиком.
    return this.taggedOf(tx, updated!);
  }

  /**
   * Вынимает задачу из версии: удаляет размещение, задачу оставляет.
   *
   * Отмена прежнего смысла: пока формулировка лежала в этой строке,
   * удаление размещения означало потерю формулировки целиком. Теперь
   * задача живёт в реестре проекта, и «убрать из версии» — это ровно то,
   * что человек и имеет в виду, нажимая крестик у чекпоинта.
   *
   * Возвращает формулировку для журнала: без неё запись сказала бы
   * «удалён чекпоинт такой-то uuid», то есть ничего.
   */
  async removeCheckpoint(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    versionId: string,
    checkpointId: string,
  ): Promise<TaggedCheckpointRow> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);
    await this.lockProject(tx, projectId);

    const row = await this.requireCheckpoint(tx, projectId, versionId, checkpointId);
    const checkpoint = await this.taggedOf(tx, row);

    // Теги не трогаются: они у задачи, и задача остаётся в реестре
    // проекта. Удаление размещения — это «вынуть из версии», и это
    // отмена прежнего смысла: пока формулировка лежала здесь, удалить
    // размещение значило потерять её целиком.
    await tx.delete(roadmapCheckpoints).where(eq(roadmapCheckpoints.id, checkpointId));

    return checkpoint;
  }

  /**
   * Переносит чекпоинт в другую версию.
   *
   * Отдельное действие, а не правка с новым `versionId`: «найти или
   * создать целевую версию» обязано быть атомарным, иначе между поиском
   * и созданием успеет вклиниться чужая запись, а в журнале перенос
   * оказался бы неотличим от переименования.
   *
   * Цель выбирается тремя способами: указанной версией, обозначением
   * новой и — пустым телом — следующей открытой версией по тому же
   * правилу, что стадия роадмапа.
   *
   * Возвращает обозначения обеих версий: журналу нужны «откуда» и
   * «куда», а достать их отдельным запросом служба не может — тот же
   * приём, что у {@link setRelease}.
   */
  async carryOverCheckpoint(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    versionId: string,
    checkpointId: string,
    input: CheckpointCarryOver,
  ): Promise<CarriedOverCheckpoint> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);
    await this.lockProject(tx, projectId);

    const source = await this.requireVersion(tx, projectId, versionId);
    await this.requireCheckpoint(tx, projectId, versionId, checkpointId);

    const { target, versionCreated } = await this.carryOverTarget(
      subject,
      tx,
      projectId,
      source,
      input,
    );

    const existing = await tx
      .select({ position: roadmapCheckpoints.position })
      .from(roadmapCheckpoints)
      .where(eq(roadmapCheckpoints.versionId, target.id));

    const [moved] = await tx
      .update(roadmapCheckpoints)
      .set({
        versionId: target.id,
        // `max + 1`, а не прежняя позиция: позиции правятся без
        // перенумерации и без уникальности, и перенесённый чекпоинт
        // приехал бы на занятое место вторым жильцом.
        position: Math.max(0, ...existing.map((row) => row.position)) + 1,
        carriedFromVersionId: source.id,
        updatedAt: new Date(),
      })
      .where(eq(roadmapCheckpoints.id, checkpointId))
      .returning();

    // Теги не трогаются вовсе: они висят на задаче, а не на версии, и
    // переезжают вместе с размещением сами.
    return {
      checkpoint: await this.taggedOf(tx, moved!),
      fromLabel: source.label,
      toLabel: target.label,
      versionCreated,
    };
  }

  /** Версия-получатель переноса: указанная, новая либо следующая открытая. */
  private async carryOverTarget(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    source: RoadmapVersionRow,
    input: CheckpointCarryOver,
  ): Promise<{ target: RoadmapVersionRow; versionCreated: boolean }> {
    if (input.targetVersionId !== undefined) {
      // Чужая версия — `404` из `requireVersion`: иначе ответ подтвердил
      // бы, что она существует в другом проекте.
      const target = await this.requireVersion(tx, projectId, input.targetVersionId);

      if (target.id === source.id) {
        throw new ConflictException('Чекпоинт уже в этой версии.');
      }

      return { target, versionCreated: false };
    }

    if (input.newVersionLabel !== undefined) {
      // Через `createVersion`, а не своей вставкой: занятое обозначение
      // обязано отвечать тем же конфликтом, что и заведение версии
      // руками, а позиция — тем же «в конец последовательности».
      return {
        target: await this.createVersion(subject, tx, projectId, { label: input.newVersionLabel }),
        versionCreated: true,
      };
    }

    const versions = await tx
      .select()
      .from(roadmapVersions)
      .where(eq(roadmapVersions.projectId, projectId))
      .orderBy(asc(roadmapVersions.position), asc(roadmapVersions.createdAt));

    const target = nextOpenVersion(versions, source.id);

    if (!target) {
      // Различимый код, а не общий конфликт: по нему интерфейс
      // спрашивает обозначение новой версии и повторяет перенос.
      throw new ConflictException({
        code: CARRY_OVER_NEEDS_LABEL,
        message: 'Открытой версии в роадмапе нет: укажите обозначение новой.',
      });
    }

    return { target, versionCreated: false };
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

    // Дата выхода бывает только у выпущенного. У выпуска «в пути» её ещё
    // нет, и записанная дата уехала бы в сводку релизов датой обещания —
    // сводка не различает «вышло тогда-то» и «обещали тогда-то».
    // Проверка здесь, а не в схеме контракта: `null` остаётся
    // допустимым при любом состоянии, отвергается именно дата.
    if (input.state !== PlatformReleaseState.Released && input.releasedDate) {
      throw new ConflictException(
        'Дата выхода бывает только у выпущенного: у выпуска «в пути» её ещё нет.',
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

  /** Теги одной задачи по порядку платформ. */
  private async tagsOf(executor: Executor, taskId: string): Promise<string[]> {
    const rows = await executor
      .select({ platformId: projectTaskPlatforms.platformId })
      .from(projectTaskPlatforms)
      .innerJoin(projectPlatforms, eq(projectPlatforms.id, projectTaskPlatforms.platformId))
      .where(eq(projectTaskPlatforms.taskId, taskId))
      .orderBy(asc(projectPlatforms.position), asc(projectPlatforms.createdAt));

    return rows.map((row) => row.platformId);
  }

  /**
   * Поля задачи и её теги по идентификатору размещения.
   *
   * Отдельным чтением, а не join'ом в каждом запросе: размещение правится
   * точечно (галочка «закрыт», позиция, перенос), и ответ обязан описать
   * состояние **после** операции — включая формулировку, которую эта
   * операция не трогала.
   */
  private async taggedOf(
    executor: Executor,
    checkpoint: RoadmapCheckpointRow,
  ): Promise<TaggedCheckpointRow> {
    const [task] = await executor
      .select({ title: projectTasks.title, url: projectTasks.url })
      .from(projectTasks)
      .where(eq(projectTasks.id, checkpoint.taskId))
      .limit(1);

    return {
      ...checkpoint,
      // Задача не может отсутствовать: ссылка `not null` и `restrict`.
      // Пустые значения здесь — не «бывает», а «база потеряла строку».
      title: task!.title,
      url: task!.url,
      platformIds: await this.tagsOf(executor, checkpoint.taskId),
    };
  }

  /**
   * Заменяет набор тегов задачи целиком.
   *
   * Платформы обязаны принадлежать проекту задачи: иначе субъект
   * с записью в «Роадмап» вписал бы идентификатор чужого проекта, и
   * уборка за удалением унесла бы строку оттуда.
   */
  private async replaceTaskPlatforms(
    tx: Transaction,
    projectId: string,
    taskId: string,
    platformIds: string[],
  ): Promise<void> {
    const unique = [...new Set(platformIds)];

    if (unique.length > 0) {
      const chosen = await tx
        .select({ id: projectPlatforms.id })
        .from(projectPlatforms)
        .where(
          and(
            eq(projectPlatforms.projectId, projectId),
            inArray(projectPlatforms.id, unique),
          ),
        );

      if (chosen.length !== unique.length) {
        throw new SectionNotVisibleError();
      }
    }

    await tx.delete(projectTaskPlatforms).where(eq(projectTaskPlatforms.taskId, taskId));

    if (unique.length > 0) {
      await tx
        .insert(projectTaskPlatforms)
        .values(unique.map((platformId) => ({ taskId, platformId })));
    }
  }

  /**
   * Токен действующей публичной ссылки либо `null`.
   *
   * Субъект в подписи, а проверка — здесь, а не в контроллере: право
   * проверяется на уровне выборки данных (ТЗ 4.1), иначе её легко
   * забыть у следующей ручки. Уровень чтения: ссылку рассылают читающие.
   */
  async findPublicLink(subject: RequestSubject, projectId: string): Promise<string | null> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Read);

    const [row] = await this.db
      .select({ token: roadmapPublicLinks.token })
      .from(roadmapPublicLinks)
      .where(eq(roadmapPublicLinks.projectId, projectId))
      .limit(1);

    return row?.token ?? null;
  }

  /**
   * Включает публикацию. Повторное включение — конфликт.
   *
   * Уровень записи проверяется здесь: раскрытие наружу остаётся
   * решением суперадмина, и его право по-прежнему требует guard
   * контроллера, — но проверка выборки обязана быть и тут (ТЗ 4.1).
   */
  async publish(subject: RequestSubject, tx: Transaction, projectId: string): Promise<string> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);

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
  async unpublish(subject: RequestSubject, tx: Transaction, projectId: string): Promise<void> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);

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

  /**
   * Отчёт по релизу одной версии (дизайн доводки, 6).
   *
   * Третья проекция поверх той же пачки данных, что роадмап: отдельных
   * выборок под отчёт не заводится, иначе «что в версии» считалось бы
   * двумя разными способами.
   *
   * Уровень чтения: отчёт — это формулировки чекпоинтов и выпуски, а они
   * открываются чтением. Чужая версия даёт `404` из `requireVersion`.
   */
  async findReport(
    subject: RequestSubject,
    projectId: string,
    versionId: string,
  ): Promise<ReleaseReport> {
    const level = await this.access.requireLevel(
      subject,
      projectId,
      Section.Roadmap,
      AccessLevel.Read,
    );

    return this.buildReport(projectId, versionId, level, { withLinks: true });
  }

  /**
   * Токен действующей ссылки на отчёт версии либо `null`.
   *
   * Субъект в подписи, а проверка — здесь: право проверяется на уровне
   * выборки (ТЗ 4.1), и у новой ручки её нельзя забыть. Уровень чтения:
   * ссылку рассылают читающие.
   */
  async findReportLink(
    subject: RequestSubject,
    projectId: string,
    versionId: string,
  ): Promise<string | null> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Read);
    await this.requireVersion(this.db, projectId, versionId);

    const [row] = await this.db
      .select({ token: roadmapReportPublicLinks.token })
      .from(roadmapReportPublicLinks)
      .where(eq(roadmapReportPublicLinks.versionId, versionId))
      .limit(1);

    return row?.token ?? null;
  }

  /**
   * Включает публикацию отчёта версии. Повторное включение — конфликт.
   *
   * Возвращает обозначение версии вместе с токеном: журналу нужно назвать
   * версию, а достать её отдельным запросом служба не может — тот же
   * приём, что у {@link setRelease}.
   */
  async publishReport(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    versionId: string,
  ): Promise<{ token: string; label: string }> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);

    const version = await this.requireVersion(tx, projectId, versionId);
    const [existing] = await this.reportLinkRow(tx, versionId);

    if (existing) {
      throw new ConflictException(
        'Отчёт по этой версии уже опубликован. Сначала отключите ссылку.',
      );
    }

    const token = generateToken();

    await tx.insert(roadmapReportPublicLinks).values({ versionId, token });

    return { token, label: version.label };
  }

  /** Отключает публикацию отчёта: прежняя ссылка гаснет. */
  async unpublishReport(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    versionId: string,
  ): Promise<{ label: string }> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);

    const version = await this.requireVersion(tx, projectId, versionId);
    const [existing] = await this.reportLinkRow(tx, versionId);

    if (!existing) {
      throw new NotFoundException('Отчёт не опубликован');
    }

    await tx
      .delete(roadmapReportPublicLinks)
      .where(eq(roadmapReportPublicLinks.id, existing.id));

    return { label: version.label };
  }

  /**
   * Публичный отчёт по токену: та же проекция чтения, без ссылок.
   *
   * Мусорный токен и отключённая публикация неразличимы — `null`,
   * снаружи одинаковый `404`.
   */
  async publicReport(token: string): Promise<PublicReleaseReport | null> {
    const [link] = await this.db
      .select({
        versionId: roadmapReportPublicLinks.versionId,
        projectId: roadmapVersions.projectId,
        projectName: projects.name,
      })
      .from(roadmapReportPublicLinks)
      .innerJoin(roadmapVersions, eq(roadmapVersions.id, roadmapReportPublicLinks.versionId))
      .innerJoin(projects, eq(projects.id, roadmapVersions.projectId))
      .where(eq(roadmapReportPublicLinks.token, token))
      .limit(1);

    if (!link) {
      return null;
    }

    // Без ссылок на задачи: страница открыта без авторизации, и адрес
    // внутреннего трекера с номером задачи наружу уходить не должен.
    const report = await this.buildReport(link.projectId, link.versionId, AccessLevel.Read, {
      withLinks: false,
    });

    return { projectName: link.projectName, ...report };
  }

  /** Строка публичной ссылки отчёта. Отдельно: её спрашивают дважды. */
  private async reportLinkRow(executor: Executor, versionId: string) {
    return executor
      .select({ id: roadmapReportPublicLinks.id })
      .from(roadmapReportPublicLinks)
      .where(eq(roadmapReportPublicLinks.versionId, versionId))
      .limit(1);
  }

  /**
   * Собирает отчёт поверх пачки `loadRoadmap`.
   *
   * Уровень приходит аргументом, а не считается здесь: публичный путь
   * субъекта не имеет вовсе, а внутренний уже спросил право у выборки.
   */
  private async buildReport(
    projectId: string,
    versionId: string,
    level: AccessLevel,
    { withLinks }: { withLinks: boolean },
  ): Promise<ReleaseReport> {
    const { versions, byVersion, checkpoints, platforms, releases, byRelease, tags } =
      await this.loadRoadmap(this.db, projectId);

    const version = versions.find((row) => row.id === versionId);

    if (!version) {
      throw new SectionNotVisibleError();
    }

    const labels = new Map(versions.map((row) => [row.id, row.label]));
    const own = byVersion.get(versionId) ?? [];

    // «Принято из»: обозначение, а не идентификатор — отчёт читают
    // глазами. Удалённая версия-источник гасит пометку (`set null`
    // на колонке), и в карту она не попадает.
    const carriedFrom = new Map<string, string>();

    for (const checkpoint of own) {
      const label = checkpoint.carriedFromVersionId
        ? labels.get(checkpoint.carriedFromVersionId)
        : undefined;

      if (label) {
        carriedFrom.set(checkpoint.id, label);
      }
    }

    // «Перенесено в»: чекпоинты, уехавшие отсюда и сейчас лежащие в
    // другой версии. Условие по текущей версии обязательно: чекпоинт
    // мог вернуться назад, и тогда он уже в собственном списке.
    const carriedOut: CarriedOutCheckpoint[] = checkpoints
      .filter(
        (checkpoint) =>
          checkpoint.carriedFromVersionId === versionId && checkpoint.versionId !== versionId,
      )
      .map((checkpoint) => ({
        id: checkpoint.id,
        title: checkpoint.title,
        isDone: checkpoint.isDone,
        position: checkpoint.position,
        platformIds: tags.get(checkpoint.id) ?? [],
        carriedTo: labels.get(checkpoint.versionId)!,
        // Поле добавляется, а не обнуляется: публичная схема отчёта
        // строгая, и `url: null` для неё такая же ошибка, как адрес.
        ...(withLinks ? { url: checkpoint.url } : {}),
      })) as CarriedOutCheckpoint[];

    return releaseReportOf(
      versionProjection(version, own, byRelease.get(versionId) ?? [], level, {
        withLinks,
        platformsByCheckpoint: tags,
      }),
      {
        platforms,
        // Сводка — та же, что наверху роадмапа: проектная, а не по одной
        // версии. Отчёт отвечает на вопрос «что в релизе», и ответ не
        // имеет права разойтись с экраном роадмапа.
        summary: releaseSummaryOf(platforms, versions, releases),
        carriedFrom,
        carriedOut,
      },
    );
  }

  /** Версии проекта с чекпоинтами, всё по порядку позиций. */
  private async loadRoadmap(executor: Executor, projectId: string) {
    const versions = await executor
      .select()
      .from(roadmapVersions)
      .where(eq(roadmapVersions.projectId, projectId))
      .orderBy(asc(roadmapVersions.position), asc(roadmapVersions.createdAt));

    // Формулировка и ссылка приходят из задачи одним join'ом, а не
    // вторым запросом на каждое размещение: роадмап читается целиком, и
    // N+1 на чекпоинтах версии — это десятки запросов на один экран.
    const checkpoints = versions.length
      ? await executor
          .select({
            id: roadmapCheckpoints.id,
            versionId: roadmapCheckpoints.versionId,
            taskId: roadmapCheckpoints.taskId,
            isDone: roadmapCheckpoints.isDone,
            position: roadmapCheckpoints.position,
            carriedFromVersionId: roadmapCheckpoints.carriedFromVersionId,
            createdAt: roadmapCheckpoints.createdAt,
            updatedAt: roadmapCheckpoints.updatedAt,
            title: projectTasks.title,
            url: projectTasks.url,
          })
          .from(roadmapCheckpoints)
          .innerJoin(projectTasks, eq(projectTasks.id, roadmapCheckpoints.taskId))
          .where(
            inArray(
              roadmapCheckpoints.versionId,
              versions.map((version) => version.id),
            ),
          )
          .orderBy(asc(roadmapCheckpoints.position), asc(roadmapCheckpoints.createdAt))
      : [];

    const byVersion = new Map<string, LoadedCheckpointRow[]>();

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
    const taskIds = checkpoints.map((checkpoint) => checkpoint.taskId);

    const tagRows = taskIds.length
      ? await executor
          .select({
            taskId: projectTaskPlatforms.taskId,
            platformId: projectTaskPlatforms.platformId,
          })
          .from(projectTaskPlatforms)
          .innerJoin(projectPlatforms, eq(projectPlatforms.id, projectTaskPlatforms.platformId))
          .where(inArray(projectTaskPlatforms.taskId, taskIds))
          .orderBy(asc(projectPlatforms.position), asc(projectPlatforms.createdAt))
      : [];

    // Ключ — задача, а не размещение: теги принадлежат ей, и проекция
    // разворачивает их на размещения по `taskId`.
    const tags = new Map<string, string[]>();

    for (const row of tagRows) {
      tags.set(row.taskId, [...(tags.get(row.taskId) ?? []), row.platformId]);
    }

    // Плоский список чекпоинтов отдаётся рядом со сгруппированным:
    // отчёту нужны чекпоинты, уехавшие из версии в другие, а в её
    // собственной группе их уже нет.
    return { versions, byVersion, checkpoints, platforms, releases, byRelease, tags };
  }

  /**
   * У проекта с платформами дата релиза принадлежит выпуску, не версии.
   *
   * Отвергается присутствие ключа, а не значение: `null` — такая же
   * запись в колонку, как и дата, а колонка перестала быть ответом
   * в тот момент, когда у проекта появилась первая платформа. Иначе
   * любой клиент, прочитавший версию и отправивший её поля обратно,
   * записал бы вычисленную дату в колонку (дизайн релизов, раздел 6).
   *
   * Проверка здесь, а не в схеме контракта: правило зависит от состояния
   * проекта, а zod о базе ничего не знает.
   *
   * Случай «платформы завели позже, в колонке прежняя дата» остаётся без
   * прямой починки сознательно: починка есть и ведёт туда, куда должна, —
   * первый же выпущенный выпуск перекрывает хранимую дату.
   */
  private async requireDateFromReleases(
    tx: Transaction,
    projectId: string,
    input: RoadmapVersionCreate | RoadmapVersionUpdate,
  ): Promise<void> {
    if (!('releasedDate' in input)) {
      return;
    }

    const [platform] = await tx
      .select({ id: projectPlatforms.id })
      .from(projectPlatforms)
      .where(eq(projectPlatforms.projectId, projectId))
      .limit(1);

    if (platform) {
      throw new ConflictException(
        'Дата релиза задаётся выпуском платформы: укажите её в строке платформы у версии.',
      );
    }
  }

  /**
   * Один писатель роадмапа на проект до конца транзакции.
   *
   * Замок берётся до чтения версии и чекпоинта: ожидавший перенос после
   * чужого коммита заново проверит источник и не запишет ложный журнал.
   * Создание и правка позиций используют тот же замок, иначе max + 1
   * гонялся бы с обычным добавлением. Повторный захват при создании
   * версии из переноса безопасен: транзакция уже владеет строкой.
   */
  private async lockProject(tx: Transaction, projectId: string): Promise<void> {
    await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .for('no key update');
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

/**
 * Следующая открытая версия — цель переноса по умолчанию.
 *
 * Правило одно со стадией и берётся из неё же: кнопка переноса и полоса
 * версий обязаны называть одну и ту же «текущую» версию, а второй
 * экземпляр правила с ней рано или поздно разошёлся бы.
 *
 * Выпущенная цель открытой не считается (так бывает, когда выпущены все
 * версии), и источник переноса сам себе целью не бывает. В обоих случаях
 * открытой версии нет, и перенос требует обозначения новой.
 */
function nextOpenVersion(
  versions: RoadmapVersionRow[],
  sourceVersionId: string,
): RoadmapVersionRow | null {
  const { current } = stageOf(versions);

  if (current === null) {
    return null;
  }

  const candidate = versions[current - 1]!;

  if (candidate.state === RoadmapVersionState.Released || candidate.id === sourceVersionId) {
    return null;
  }

  return candidate;
}

/**
 * Размещение вместе с полями задачи и её тегами.
 *
 * Формулировка и ссылка живут у задачи, теги — своей таблицей, а ответы
 * ручек собираются литералом: без этих полей контроллеру нечего положить
 * в обязательные поля контракта. Склейка идёт здесь, в репозитории, а не
 * в контроллере: право проверяется на уровне выборки (ТЗ 4.1), и второе
 * чтение задачи мимо репозитория прошло бы мимо проверки.
 */
export type TaggedCheckpointRow = RoadmapCheckpointRow & {
  title: string;
  url: string | null;
  platformIds: string[];
};

/**
 * Размещение с полями задачи — то, что читает проекция.
 *
 * Без тегов: их проекция получает отдельной картой по `taskId`, потому
 * что читает роадмап целиком и собирает их одним запросом на все
 * размещения сразу.
 */
export type LoadedCheckpointRow = RoadmapCheckpointRow & {
  title: string;
  url: string | null;
};

/**
 * Перенесённый чекпоинт вместе с обозначениями «откуда» и «куда».
 *
 * Обозначения возвращаются строкой результата, а не достаются службой:
 * журналу нужны оба, а второй запрос за ними прошёл бы мимо транзакции
 * переноса. Идентификатор версии-получателя — в самом чекпоинте.
 */
export interface CarriedOverCheckpoint {
  checkpoint: TaggedCheckpointRow;
  fromLabel: string;
  toLabel: string;
  versionCreated: boolean;
}
