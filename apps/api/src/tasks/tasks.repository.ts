import {
  AccessLevel,
  Section,
  TaskOrigin,
  type ProjectTask,
  type ProjectTaskCreate,
  type ProjectTaskUpdate,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { SectionNotVisibleError } from '../access/access.errors';
import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { DATABASE } from '../db/db.module';
import type { Database, Executor, Transaction } from '../db/db.types';
import {
  projectPlatforms,
  projectTaskPlatforms,
  projectTasks,
  roadmapCheckpoints,
  roadmapVersions,
  taskExports,
  type ProjectTaskRow,
  type TaskExportRow,
} from '../db/schema';
import { taskExportOf } from '../tracker/task-export.projection';
import { TaskAlreadyPlacedError, TaskPlacedError } from './tasks.errors';

/**
 * Задачи проекта: реестр, из которого они попадают в версии роадмапа.
 *
 * Право — **«Роадмап»**, и новой единицы выдачи доступа не появилось:
 * задача отвечает на вопрос «что делаем», то есть это роадмап и есть
 * (дизайн, 4). Чтение — уровень чтения, любая правка — записи.
 *
 * Субъект в подписи каждого метода, и проверка внутри, тем же
 * исполнителем, которым идёт работа: право проверяется на уровне выборки
 * данных (ТЗ 4.1), а обращение к другому подключению внутри транзакции
 * увидело бы состояние до неё.
 */
@Injectable()
export class TasksRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly access: AccessService,
  ) {}

  /**
   * Задачи проекта вместе с размещением и зеркалом выгрузки, одним
   * запросом.
   *
   * Порядок: сначала задачи вне версий, затем по позиции версии и
   * позиции внутри неё. Вне версии — сверху намеренно: это то, о чём
   * человек ещё не решил, и ради чего он на этот экран и пришёл.
   *
   * `left join` на размещение, версию и выгрузку, а не четыре запроса:
   * «какие задачи есть у проекта» — один вопрос, и N+1 на реестре
   * означал бы по запросу на задачу.
   *
   * Условие соединения с выгрузкой — только задача, без вида трекера, и
   * строк от этого не удваивается: ключ выгрузки это пара «задача ×
   * трекер», а в перечне `tracker_kind` одно значение (дизайн, 10.1),
   * то есть не больше одной строки на задачу гарантирует база. Второй вид
   * трекера обязан переделать проекцию здесь же — `export` в контракте
   * одиночный, и выбирать из двух зеркал придётся явно.
   */
  async findForProject(
    subject: RequestSubject,
    projectId: string,
    filter: { loose?: boolean } = {},
  ): Promise<ProjectTask[]> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Read);

    const rows = await this.db
      .select({
        id: projectTasks.id,
        projectId: projectTasks.projectId,
        title: projectTasks.title,
        completionRule: projectTasks.completionRule,
        url: projectTasks.url,
        origin: projectTasks.origin,
        sourceSummaryId: projectTasks.sourceSummaryId,
        createdAt: projectTasks.createdAt,
        updatedAt: projectTasks.updatedAt,
        versionId: roadmapCheckpoints.versionId,
        versionLabel: roadmapVersions.label,
        versionPosition: roadmapVersions.position,
        isDone: roadmapCheckpoints.isDone,
        position: roadmapCheckpoints.position,
        carriedFromVersionId: roadmapCheckpoints.carriedFromVersionId,
        details: taskExports.details,
        tracker: taskExports.tracker,
        externalId: taskExports.externalId,
        externalUrl: taskExports.externalUrl,
        externalBoardId: taskExports.externalBoardId,
        externalColumnId: taskExports.externalColumnId,
        isCompleted: taskExports.isCompleted,
        exportedAt: taskExports.exportedAt,
        exportUpdatedAt: taskExports.updatedAt,
        checkedAt: taskExports.checkedAt,
        failureCode: taskExports.failureCode,
      })
      .from(projectTasks)
      .leftJoin(roadmapCheckpoints, eq(roadmapCheckpoints.taskId, projectTasks.id))
      .leftJoin(roadmapVersions, eq(roadmapVersions.id, roadmapCheckpoints.versionId))
      .leftJoin(taskExports, eq(taskExports.taskId, projectTasks.id))
      .where(
        filter.loose === true
          ? and(eq(projectTasks.projectId, projectId), isNull(roadmapCheckpoints.id))
          : eq(projectTasks.projectId, projectId),
      )
      .orderBy(
        // `nulls first` именно так и читается: задачи вне версии сверху.
        sql`${roadmapVersions.position} asc nulls first`,
        asc(roadmapCheckpoints.position),
        asc(projectTasks.createdAt),
      );

    const tags = await this.tagsOf(
      this.db,
      rows.map((row) => row.id),
    );

    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      title: row.title,
      completionRule: row.completionRule,
      url: row.url,
      origin: row.origin,
      sourceSummaryId: row.sourceSummaryId,
      platformIds: tags.get(row.id) ?? [],
      // Размещение собирается объектом: «вне версии» читается одним
      // условием, а не проверкой четырёх полей на `null` по отдельности.
      placement:
        row.versionId === null || row.versionLabel === null
          ? null
          : {
              versionId: row.versionId,
              versionLabel: row.versionLabel,
              isDone: row.isDone ?? false,
              position: row.position ?? 1,
              carriedFromVersionId: row.carriedFromVersionId ?? null,
            },
      export: taskExportOf(row),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  /** Заводит задачу вне версий. */
  async create(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    input: ProjectTaskCreate,
  ): Promise<ProjectTaskRow> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);

    const [created] = await tx
      .insert(projectTasks)
      .values({
        projectId,
        title: input.title,
        // `?? null`, а не `input.url`: поле необязательно, и `undefined`
        // заставил бы Drizzle пропустить колонку молча.
        url: input.url ?? null,
        origin: TaskOrigin.Manual,
      })
      .returning();

    if (input.platformIds) {
      await this.replacePlatforms(tx, projectId, created!.id, input.platformIds);
    }

    return created!;
  }

  /**
   * Заводит задачу, приехавшую из саммари созвона.
   *
   * Свой метод рядом с {@link create}, а не параметр у него: `origin` и
   * происхождение задаёт **путь**, а не клиент. Параметром они стали бы
   * полем тела, и присланный `origin: summary` сделал бы признак «из
   * созвона 14 ноября» ложью — а это единственный след происхождения.
   *
   * Право то же и проверяется так же: релиз черновика и так требует
   * записи в «Роадмап», а задача принадлежит ему.
   */
  async createFromSummary(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    summaryId: string,
    input: { title: string; url?: string | null; platformIds?: string[] },
  ): Promise<ProjectTaskRow> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);

    const [created] = await tx
      .insert(projectTasks)
      .values({
        projectId,
        title: input.title,
        url: input.url ?? null,
        origin: TaskOrigin.Summary,
        sourceSummaryId: summaryId,
      })
      .returning();

    if (input.platformIds && input.platformIds.length > 0) {
      await this.replacePlatforms(tx, projectId, created!.id, input.platformIds);
    }

    return created!;
  }

  /**
   * Правит формулировку, ссылку и теги задачи.
   *
   * Отсутствие набора тегов означает «не трогать», пустой массив — «снять
   * все»: та же идиома, что у черновика саммари, и по той же причине —
   * правка одного поля не должна сносить другое.
   */
  async update(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    taskId: string,
    input: ProjectTaskUpdate,
  ): Promise<ProjectTaskRow> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);
    await this.requireInProject(tx, projectId, taskId);

    const { platformIds, ...fields } = input;

    const [updated] =
      Object.keys(fields).length > 0
        ? await tx
            .update(projectTasks)
            .set({ ...fields, updatedAt: new Date() })
            .where(eq(projectTasks.id, taskId))
            .returning()
        : await tx.select().from(projectTasks).where(eq(projectTasks.id, taskId)).limit(1);

    if (platformIds) {
      await this.replacePlatforms(tx, projectId, taskId, platformIds);
    }

    return updated!;
  }

  /**
   * Удаляет задачу из реестра вместе с её зеркалом выгрузки.
   *
   * Размещённую — отказ, а не каскад: удаление меняло бы прогресс версии
   * с другого экрана и молча. Сначала вынь из версии.
   *
   * **Зеркало уносится здесь, явно, и это не то же самое, что каскад.**
   * Ссылка `task_exports.task_id` стоит `restrict` (дизайн, 10.5) ровно
   * затем, чтобы распорядиться зеркалом был обязан названный путь
   * удаления — тот, который решает, что сказать человеку. Каскад сделал бы
   * это молча, а пропустить шаг нельзя: без него удаление выгруженной
   * задачи приходит ошибкой драйвера, то есть `500` вместо ответа.
   *
   * **Задача в трекере при этом остаётся жить**: удалять чужую задачу по
   * своей кнопке мы не вправе. Цена названа и она настоящая — ответ на
   * вопрос «а в трекере она осталась?» уходит из реестра, и единственным
   * его следом остаётся запись журнала: поэтому унесённое зеркало
   * возвращается наверх, а не отбрасывается здесь (`task.deleted` называет
   * идентификатор задачи в трекере). Показывать осиротевшую выгрузку на
   * экране, как обещает дизайн 10.5, пока нечем: признака «осиротела» нет
   * ни в контракте, ни в базе, и завести его без спроса — значит выбрать за
   * владельца, где такая строка живёт после смерти задачи.
   */
  async remove(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    taskId: string,
  ): Promise<{ task: ProjectTaskRow; export: TaskExportRow | null }> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);

    const task = await this.requireInProject(tx, projectId, taskId);

    if (await this.placementOf(tx, taskId)) {
      throw new TaskPlacedError();
    }

    await tx.delete(projectTaskPlatforms).where(eq(projectTaskPlatforms.taskId, taskId));
    // Условие по задаче, а не по проекту: промахнись оно шире, и удаление
    // одной задачи стёрло бы зеркала всего реестра, а повторная выгрузка
    // завела бы в трекере вторые копии всех задач проекта.
    const [exported] = await tx
      .delete(taskExports)
      .where(eq(taskExports.taskId, taskId))
      .returning();
    await tx.delete(projectTasks).where(eq(projectTasks.id, taskId));

    return { task, export: exported ?? null };
  }

  /**
   * Вынимает задачу из версии, оставляя её в реестре.
   *
   * Отдельное действие рядом с удалением размещения у роадмапа: там
   * действие принадлежит версии («убрать из этой версии»), здесь —
   * задаче («эта задача больше не в плане»). Поведение одно, и путь
   * записи тоже один — размещение удаляется здесь же, потому что
   * проверка права и так уже сделана по «Роадмапу».
   */
  async detach(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    taskId: string,
  ): Promise<ProjectTaskRow> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);

    const task = await this.requireInProject(tx, projectId, taskId);

    await tx.delete(roadmapCheckpoints).where(eq(roadmapCheckpoints.taskId, taskId));

    return task;
  }

  /** Задача проекта либо отказ: чужая не раскрывается вовсе. */
  private async requireInProject(
    executor: Executor,
    projectId: string,
    taskId: string,
  ): Promise<ProjectTaskRow> {
    const [task] = await executor
      .select()
      .from(projectTasks)
      .where(and(eq(projectTasks.id, taskId), eq(projectTasks.projectId, projectId)))
      .limit(1);

    if (!task) {
      throw new SectionNotVisibleError();
    }

    return task;
  }

  /** Размещение задачи в версии либо `null`. */
  private async placementOf(executor: Executor, taskId: string): Promise<string | null> {
    const [placed] = await executor
      .select({ id: roadmapCheckpoints.id })
      .from(roadmapCheckpoints)
      .where(eq(roadmapCheckpoints.taskId, taskId))
      .limit(1);

    return placed?.id ?? null;
  }

  /** Теги набора задач по порядку платформ, одним запросом. */
  private async tagsOf(executor: Executor, taskIds: string[]): Promise<Map<string, string[]>> {
    const tags = new Map<string, string[]>();

    if (taskIds.length === 0) {
      return tags;
    }

    const rows = await executor
      .select({
        taskId: projectTaskPlatforms.taskId,
        platformId: projectTaskPlatforms.platformId,
      })
      .from(projectTaskPlatforms)
      .innerJoin(projectPlatforms, eq(projectPlatforms.id, projectTaskPlatforms.platformId))
      .where(inArray(projectTaskPlatforms.taskId, taskIds))
      .orderBy(asc(projectPlatforms.position), asc(projectPlatforms.createdAt));

    for (const row of rows) {
      tags.set(row.taskId, [...(tags.get(row.taskId) ?? []), row.platformId]);
    }

    return tags;
  }

  /**
   * Заменяет набор тегов задачи целиком.
   *
   * Платформы обязаны принадлежать проекту задачи: иначе субъект с
   * записью в «Роадмап» вписал бы идентификатор чужого проекта, и уборка
   * за удалением платформы унесла бы строку оттуда.
   */
  private async replacePlatforms(
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
          and(eq(projectPlatforms.projectId, projectId), inArray(projectPlatforms.id, unique)),
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
}

/** Отказ размещения наружу: им пользуется и роадмап. */
export { TaskAlreadyPlacedError };
