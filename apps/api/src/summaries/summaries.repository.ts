import {
  AccessLevel,
  ChronicleSource,
  Section,
  SUMMARY_TASK_NOT_ACTIVE,
  SummaryTaskState,
  SummaryTaskOrigin,
  type Platform,
  type ProjectMetadata,
  type SummaryCreate,
  type SummaryDetail,
  type SummaryListItem,
  type SummaryTask,
  type SummaryTasksReplace,
} from '@cairn/shared';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, max, eq, inArray } from 'drizzle-orm';

import { SectionNotVisibleError } from '../access/access.errors';
import { AccessService, meets } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { ChronicleRepository } from '../chronicle/chronicle.repository';
import { DATABASE } from '../db/db.module';
import type { Database, Executor, Transaction } from '../db/db.types';
import {
  chronicleEntries,
  projectPlatforms,
  projects,
  roadmapVersions,
  summaries,
  summaryTaskDrafts,
  summaryTaskPlatforms,
  transcriptionJobs,
  type SummaryRow,
  type TranscriptionJobRow,
} from '../db/schema';
import { RoadmapRepository } from '../roadmap/roadmap.repository';
import { nextVersionLabel } from './next-version-label';
import { mediaPathsOf } from './transcription/media-paths';
import {
  jobProjectionOf,
  latestOf,
  type RemovedMedia,
} from './transcription/transcription.repository';

/**
 * Доступ к саммари созвонов и их черновикам задач.
 *
 * Экран открывается правом записи на «Хронику» (дизайн, раздел 1.2):
 * первое, что делает поток, — сохраняет текст, а текст живёт записью
 * хроники. Поэтому каждый метод принимает субъект первым аргументом и сам
 * требует `Chronicle ≥ write` тем же исполнителем, которым работает (ТЗ
 * 4.1).
 *
 * Данные роадмапа — обозначение версии-получателя и подсказка следующего
 * обозначения — отдаются только при `Roadmap ≥ metadata`, и уровень
 * **спрашивается**, а не ловится исключением: `try/catch` вокруг
 * `requireLevel` прятал бы внутрь и настоящие ошибки, а `404` чужого
 * проекта превращался бы в тихий `null`.
 */
@Injectable()
export class SummariesRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly access: AccessService,
    private readonly chronicle: ChronicleRepository,
    private readonly roadmap: RoadmapRepository,
  ) {}

  /** Цели выбора фильтруются по хронике, а не по видимости паспорта. */
  async writableProjects(subject: RequestSubject): Promise<ProjectMetadata[]> {
    const ids = await this.access.projectIdsWithLevel(
      subject,
      Section.Chronicle,
      AccessLevel.Write,
    );
    if (ids.length === 0) return [];
    return this.db
      .select({
        id: projects.id,
        slug: projects.slug,
        name: projects.name,
        lifecycle: projects.lifecycle,
      })
      .from(projects)
      .where(inArray(projects.id, ids))
      .orderBy(asc(projects.name));
  }

  /** Общая история использует ту же выборку целей и те же проекции саммари. */
  async findOverview(subject: RequestSubject): Promise<SummaryListItem[]> {
    const targets = await this.writableProjects(subject);
    const lists = await Promise.all(
      targets.map((project) => this.findForProject(subject, project.id)),
    );
    return lists.flat().sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  /** История саммари проекта: свежие сверху. */
  async findForProject(
    subject: RequestSubject,
    projectId: string,
    executor: Executor = this.db,
  ): Promise<SummaryListItem[]> {
    await this.requireWrite(subject, projectId, executor);

    const rows = await executor
      .select({
        summary: summaries,
        title: chronicleEntries.title,
        occurredOn: chronicleEntries.occurredOn,
        projectName: projects.name,
      })
      .from(summaries)
      .innerJoin(chronicleEntries, eq(chronicleEntries.id, summaries.chronicleEntryId))
      .innerJoin(projects, eq(projects.id, summaries.projectId))
      .where(eq(summaries.projectId, projectId))
      .orderBy(desc(summaries.createdAt));

    const counts = await this.taskCounts(
      executor,
      rows.map((row) => row.summary.id),
    );
    const labels = await this.releasedLabels(
      projectId,
      rows.map((row) => row.summary.releasedVersionId),
      executor,
      await this.seesRoadmap(subject, projectId, executor),
    );

    return rows.map((row) => ({
      id: row.summary.id,
      projectId: row.summary.projectId,
      projectName: row.projectName,
      occurredOn: row.occurredOn,
      title: row.title,
      ...countsOf(counts.get(row.summary.id)),
      isReleased: row.summary.releasedVersionId !== null,
      ...releasedOf(row.summary.releasedVersionId, labels),
      createdAt: row.summary.createdAt.toISOString(),
    }));
  }

  /** Саммари целиком: текст, черновик, подсказка обозначения версии. */
  async findById(
    subject: RequestSubject,
    projectId: string,
    summaryId: string,
    executor: Executor = this.db,
  ): Promise<SummaryDetail> {
    const row = await this.requireForWrite(subject, executor, projectId, summaryId);

    return this.detailOf(subject, executor, row);
  }

  /**
   * Сохраняет текст созвона записью хроники и заводит над ней саммари.
   *
   * Запись создаётся `ChronicleRepository` — он же проверяет право, и
   * вторая проверка здесь была бы дублем, — тем же `projectId` и в той же
   * транзакции: условие «запись принадлежит проекту саммари» в базе без
   * триггера не выражается, а триггеров в проекте нет.
   */
  async create(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    input: SummaryCreate,
  ): Promise<SummaryDetail> {
    const entry = await this.chronicle.create(
      subject,
      tx,
      projectId,
      { occurredOn: input.occurredOn, title: input.title, content: input.text },
      ChronicleSource.Summary,
    );

    const [created] = await tx
      .insert(summaries)
      .values({
        projectId,
        chronicleEntryId: entry.id,
        createdBySubjectId: subject.id,
      })
      .returning();

    return this.detailOf(subject, tx, created!);
  }

  /**
   * Заменяет черновик задач целиком.
   *
   * Полная замена, а не разностное обновление: позиции нумеруются с 1 по
   * порядку присланного массива, и сохранять уникальность позиций при
   * перестановке иначе пришлось бы отложенными обновлениями на каждый
   * шаг. Строка с `id` сохраняет своё происхождение — иначе «предложено
   * моделью» снималось бы первым же сохранением; строка без `id` набрана
   * человеком.
   *
   * Архив и уехавшие задачи сохраняются, даже если редактор их не прислал.
   */
  async replaceTasks(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    summaryId: string,
    input: SummaryTasksReplace,
  ): Promise<SummaryDetail> {
    await this.requireForWrite(subject, tx, projectId, summaryId);
    await this.lockSummary(tx, projectId, summaryId);

    const existing = await this.tasksOf(tx, summaryId);
    const kept = new Map(existing.map((task) => [task.id, task]));

    // Набор тегов по позиции новой строки: сопоставлять по порядку
    // `RETURNING` нельзя — стандарт его не обещает, а позиции внутри
    // саммари уникальны по построению, их нумерует этот же метод.
    const tagsByPosition = new Map<number, string[]>();

    const values = input.tasks.map((task, index) => {
      // Присланный `id`, которого в черновике этого саммари нет, — либо
      // исчезнувшая строка, либо чужая. Молча заводить её заново значило
      // бы сделать правку черновика способом увести строку из другого
      // саммари.
      if (task.id !== undefined && !kept.has(task.id)) {
        throw new NotFoundException(`Задача ${task.id} в черновике не найдена.`);
      }

      const previous = task.id === undefined ? undefined : kept.get(task.id)!;
      if (previous && previous.state !== SummaryTaskState.Active) throw taskNotActive();
      const platformIds = task.platformIds ?? previous?.platformIds ?? [];
      const position = index + 1;

      if (platformIds.length > 0) {
        tagsByPosition.set(position, [...new Set(platformIds)]);
      }

      return {
        summaryId,
        title: task.title,
        // Отсутствие поля означает «не трогать»: редактор субъекта без
        // выдачи на роадмап чипов не видит и набор не отправляет, и его
        // правка формулировки не вправе стереть чужую работу. У новой
        // строки сохранять нечего — она пуста (дизайн, 3.3).
        url: task.url === undefined ? (previous?.url ?? null) : task.url,
        position,
        origin: task.id === undefined ? SummaryTaskOrigin.Human : previous!.origin,
      };
    });

    await this.clearTasks(tx, summaryId, SummaryTaskState.Active);

    if (values.length > 0) {
      const inserted = await tx
        .insert(summaryTaskDrafts)
        .values(values)
        .returning({ id: summaryTaskDrafts.id, position: summaryTaskDrafts.position });

      const tags = inserted.flatMap((row) =>
        (tagsByPosition.get(row.position) ?? []).map((platformId) => ({
          draftId: row.id,
          platformId,
        })),
      );

      if (tags.length > 0) {
        await tx.insert(summaryTaskPlatforms).values(tags);
      }
    }

    const [updated] = await tx
      .update(summaries)
      .set({ updatedAt: new Date() })
      .where(eq(summaries.id, summaryId))
      .returning();

    return this.detailOf(subject, tx, updated!);
  }

  /**
   * Текст саммари и момент его последней правки.
   *
   * Отдельно от {@link findById}: шагу разбивки нужен не весь паспорт с
   * подсказками роадмапа, а текст, его длина и момент правки — он уедет
   * в `suggested_text_at`, по которому потом считается «текст поправили
   * после разбивки». Момент берётся **до** обращения к предложителю: в
   * нём и есть тот текст, который ушёл наружу.
   */
  async sourceTextOf(
    subject: RequestSubject,
    executor: Executor,
    projectId: string,
    summaryId: string,
  ): Promise<{ text: string; textUpdatedAt: Date }> {
    const row = await this.requireForWrite(subject, executor, projectId, summaryId);

    const [entry] = await executor
      .select({ content: chronicleEntries.content, updatedAt: chronicleEntries.updatedAt })
      .from(chronicleEntries)
      .where(eq(chronicleEntries.id, row.chronicleEntryId))
      .limit(1);

    if (!entry) {
      // Ссылка `not null` с `restrict`: охрана инварианта, а не случай.
      throw new SectionNotVisibleError();
    }

    return {
      text: entry.content,
      textUpdatedAt: entry.updatedAt,
    };
  }

  /**
   * Заменяет черновик предложенными задачами и ставит отметку разбивки.
   *
   * Отдельный метод, а не {@link replaceTasks} с чужим происхождением:
   * тот нумерует строки без `id` как набранные человеком, и пометка
   * «предложено моделью» (ТЗ 5.3) через него не выставляется вовсе.
   *
   * Отметка пишется той же транзакцией, что и строки: `suggester_*` без
   * задач читались бы как «разбивка была, задач не предложено», а задачи
   * без отметки — как набранные руками.
   *
   * Пустая разбивка — не пустая замена: применять нечего, и прежние
   * строки остаются на месте. Иначе ответ «задач в тексте нет» — ровно
   * тот, о котором просит системная инструкция, — стирал бы список,
   * который человек правил двадцать минут. Отметка при этом обновляется:
   * разбивка состоялась, и человек обязан это видеть.
   */
  async replaceWithSuggested(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    summaryId: string,
    titles: string[],
    stamp: { name: string; model: string; textUpdatedAt: Date; dropped: number },
  ): Promise<SummaryDetail> {
    await this.requireForWrite(subject, tx, projectId, summaryId);
    await this.lockSummary(tx, projectId, summaryId);

    if (titles.length > 0) {
      await this.clearTasks(tx, summaryId, SummaryTaskState.Active);
      // Ни ссылки, ни тегов: из вывода модели берётся только
      // формулировка, и назвать платформу ей нечем (дизайн, 1.1).
      await tx.insert(summaryTaskDrafts).values(
        titles.map((title, index) => ({
          summaryId,
          title,
          url: null,
          position: index + 1,
          origin: SummaryTaskOrigin.Model,
        })),
      );
    }

    const now = new Date();
    const [updated] = await tx
      .update(summaries)
      .set({
        suggesterName: stamp.name,
        suggesterModel: stamp.model,
        suggesterDropped: stamp.dropped,
        suggestedAt: now,
        suggestedTextAt: stamp.textUpdatedAt,
        updatedAt: now,
      })
      .where(eq(summaries.id, summaryId))
      .returning();

    return this.detailOf(subject, tx, updated!);
  }

  /**
   * Удаляет саммари с черновиком и возвращает удалённое.
   *
   * Запись хроники остаётся: текст — артефакт проекта, и его удаление —
   * действие секции «Хроника», а не этого потока. Порядок обратен
   * ссылкам: на них `restrict`, и без уборки черновика удаление упёрлось
   * бы в целостность.
   */
  async remove(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    summaryId: string,
  ): Promise<SummaryDetail & RemovedMedia> {
    await this.requireWrite(subject, projectId, tx);
    const row = await this.lockSummary(tx, projectId, summaryId);
    const detail = await this.detailOf(subject, tx, row);
    const mediaPaths = await this.clearTranscriptions(tx, summaryId);

    await this.clearTasks(tx, summaryId);
    await tx.delete(summaries).where(eq(summaries.id, summaryId));

    return { ...detail, mediaPaths };
  }

  /**
   * Уносит задачи расшифровки саммари и отдаёт пути их файлов.
   *
   * Ссылка `restrict`, каскадов в проекте нет: без явной уборки саммари с
   * расшифровкой стало бы неудаляемым. Пути возвращаются вызывающему, а не
   * удаляются здесь: `unlink` обязан идти **после** фиксации транзакции —
   * удаление файла не откатывается, и обратный порядок унёс бы запись у
   * саммари, удаление которого потом откатилось (дизайн, 2.5 пункт 4).
   *
   * Отдельной записи в журнал это не получает по той же причине, по
   * которой её не получает уборка саммари при удалении записи хроники:
   * человек удалял саммари, и журнал обязан описывать то, что он сделал.
   */
  private async clearTranscriptions(tx: Transaction, summaryId: string): Promise<string[]> {
    const rows = await tx
      .select({
        uploadPath: transcriptionJobs.uploadPath,
        audioPath: transcriptionJobs.audioPath,
      })
      .from(transcriptionJobs)
      .where(eq(transcriptionJobs.summaryId, summaryId));

    await tx.delete(transcriptionJobs).where(eq(transcriptionJobs.summaryId, summaryId));

    return mediaPathsOf(rows);
  }

  async archive(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    summaryId: string,
    ids: string[],
  ) {
    return this.changeTasks(subject, tx, projectId, summaryId, ids, 'archive');
  }

  async restore(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    summaryId: string,
    ids: string[],
  ) {
    return this.changeTasks(subject, tx, projectId, summaryId, ids, 'restore');
  }

  async removeTasks(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    summaryId: string,
    ids: string[],
  ) {
    return this.changeTasks(subject, tx, projectId, summaryId, ids, 'remove');
  }

  private async changeTasks(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    summaryId: string,
    ids: string[],
    action: 'archive' | 'restore' | 'remove',
  ): Promise<SummaryDetail> {
    await this.requireWrite(subject, projectId, tx);
    const summary = await this.lockSummary(tx, projectId, summaryId);
    const tasks = await this.selectedTasks(tx, summaryId, ids);
    const allowed = action === 'archive' ? SummaryTaskState.Active : SummaryTaskState.Archived;
    if (
      tasks.some((task) =>
        action === 'remove' ? task.state === SummaryTaskState.Released : task.state !== allowed,
      )
    )
      throw taskNotActive();

    const selectedIds = tasks.map((task) => task.id);
    if (action === 'remove') {
      await this.deleteTasks(tx, selectedIds);
    } else if (action === 'archive') {
      await tx
        .update(summaryTaskDrafts)
        .set({ state: SummaryTaskState.Archived })
        .where(inArray(summaryTaskDrafts.id, selectedIds));
    } else {
      // После замены черновика прежняя позиция могла достаться другой задаче.
      const [last] = await tx
        .select({ position: max(summaryTaskDrafts.position) })
        .from(summaryTaskDrafts)
        .where(
          and(
            eq(summaryTaskDrafts.summaryId, summaryId),
            eq(summaryTaskDrafts.state, SummaryTaskState.Active),
          ),
        );
      let position = last?.position ?? 0;
      for (const task of tasks) {
        await tx
          .update(summaryTaskDrafts)
          .set({ state: SummaryTaskState.Active, position: ++position })
          .where(eq(summaryTaskDrafts.id, task.id));
      }
    }

    return this.detailOf(subject, tx, summary);
  }

  /** Проверяет обе выдачи до чтения выбранных задач. */
  async tasksForRelease(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    summaryId: string,
    ids: string[],
  ): Promise<SummaryTask[]> {
    const roadmapLevel = await this.access.resolveLevel(subject, projectId, Section.Roadmap, tx);
    if (roadmapLevel === null || roadmapLevel === undefined) throw new SectionNotVisibleError();
    await this.requireWrite(subject, projectId, tx);
    await this.lockSummary(tx, projectId, summaryId);
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);
    const tasks = await this.selectedTasks(tx, summaryId, ids);
    if (tasks.some((task) => task.state !== SummaryTaskState.Active)) throw taskNotActive();
    return tasks;
  }

  private async selectedTasks(
    tx: Transaction,
    summaryId: string,
    ids: string[],
  ): Promise<SummaryTask[]> {
    const requested = new Set(ids);
    const tasks = (await this.tasksOf(tx, summaryId)).filter((task) => requested.has(task.id));
    if (tasks.length !== requested.size) throw new SectionNotVisibleError();
    return tasks;
  }

  /** Перенос повторяем: подтверждённая строка возвращает прежнюю задачу, не копию. */
  async tasksForTransfer(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    summaryId: string,
    ids: string[],
  ): Promise<SummaryTask[]> {
    await this.requireWrite(subject, projectId, tx);
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);
    await this.lockSummary(tx, projectId, summaryId);
    const tasks = await this.selectedTasks(tx, summaryId, ids);
    if (
      tasks.some(
        (task) =>
          task.state !== SummaryTaskState.Active &&
          !(task.state === SummaryTaskState.Released && task.taskId),
      )
    )
      throw taskNotActive();
    return tasks;
  }

  async markTransferred(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    summaryId: string,
    transferred: { draftId: string; taskId: string }[],
  ): Promise<void> {
    await this.requireForWrite(subject, tx, projectId, summaryId);
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);
    for (const { draftId, taskId } of transferred) {
      await tx
        .update(summaryTaskDrafts)
        .set({ state: SummaryTaskState.Released, taskId })
        .where(and(eq(summaryTaskDrafts.summaryId, summaryId), eq(summaryTaskDrafts.id, draftId)));
    }
    if (transferred.length)
      await tx.update(summaries).set({ updatedAt: new Date() }).where(eq(summaries.id, summaryId));
  }

  /** Общий замок удерживает набор задач до конца изменения или релиза. */
  private async lockSummary(
    tx: Transaction,
    projectId: string,
    summaryId: string,
  ): Promise<SummaryRow> {
    const [row] = await tx
      .select()
      .from(summaries)
      .where(and(eq(summaries.id, summaryId), eq(summaries.projectId, projectId)))
      .for('no key update');
    if (!row) throw new SectionNotVisibleError();
    return row;
  }

  /** Сохраняет получателя тем же исполнителем, которым создана версия. */
  async markReleased(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    summaryId: string,
    versionId: string,
    released: { draftId: string; taskId: string }[],
  ): Promise<void> {
    await this.requireForWrite(subject, tx, projectId, summaryId);
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);

    // По одной строке, а не одним `IN`: у каждой свой `task_id`, и
    // «уехала вот в эту задачу» — единственная связь, по которой экран
    // саммари потом доберётся до задачи в реестре.
    for (const { draftId, taskId } of released) {
      await tx
        .update(summaryTaskDrafts)
        .set({ state: SummaryTaskState.Released, releasedVersionId: versionId, taskId })
        .where(and(eq(summaryTaskDrafts.summaryId, summaryId), eq(summaryTaskDrafts.id, draftId)));
    }
    await tx
      .update(summaries)
      .set({ releasedVersionId: versionId, updatedAt: new Date() })
      .where(eq(summaries.id, summaryId));
  }

  /**
   * Задачи черновика по порядку позиций.
   *
   * Вызывается после проверки доступа к саммари тем же исполнителем,
   * поэтому сборке детали не нужен повторный запрос прав.
   */
  private async tasksOf(executor: Executor, summaryId: string): Promise<SummaryTask[]> {
    const rows = await executor
      .select()
      .from(summaryTaskDrafts)
      .where(eq(summaryTaskDrafts.summaryId, summaryId))
      .orderBy(
        asc(summaryTaskDrafts.position),
        asc(summaryTaskDrafts.createdAt),
        asc(summaryTaskDrafts.id),
      );

    const tags = await this.tagsOf(
      executor,
      rows.map((row) => row.id),
    );

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      position: row.position,
      origin: row.origin,
      state: row.state,
      releasedVersionId: row.releasedVersionId,
      releasedVersionLabel: null,
      taskId: row.taskId,
      url: row.url,
      platformIds: tags.get(row.id) ?? [],
    }));
  }

  /**
   * Теги всех строк черновика — одним запросом, а не по строке.
   *
   * Порядок внутри набора — порядок платформ проекта, как у тегов
   * чекпоинта (`RoadmapRepository.tagsOf`): без него набор приходил бы
   * в порядке вставки, и две одинаковые разметки выглядели бы разными.
   */
  private async tagsOf(executor: Executor, draftIds: string[]): Promise<Map<string, string[]>> {
    if (draftIds.length === 0) {
      return new Map();
    }

    const rows = await executor
      .select({
        draftId: summaryTaskPlatforms.draftId,
        platformId: summaryTaskPlatforms.platformId,
      })
      .from(summaryTaskPlatforms)
      .innerJoin(projectPlatforms, eq(projectPlatforms.id, summaryTaskPlatforms.platformId))
      .where(inArray(summaryTaskPlatforms.draftId, draftIds))
      .orderBy(asc(projectPlatforms.position), asc(projectPlatforms.createdAt));

    const tags = new Map<string, string[]>();

    for (const row of rows) {
      tags.set(row.draftId, [...(tags.get(row.draftId) ?? []), row.platformId]);
    }

    return tags;
  }

  private async clearTasks(
    tx: Transaction,
    summaryId: string,
    state?: SummaryTaskState,
  ): Promise<void> {
    const rows = await tx
      .select({ id: summaryTaskDrafts.id })
      .from(summaryTaskDrafts)
      .where(
        and(
          eq(summaryTaskDrafts.summaryId, summaryId),
          state && eq(summaryTaskDrafts.state, state),
        ),
      );
    await this.deleteTasks(
      tx,
      rows.map((row) => row.id),
    );
  }

  /** На связях тегов стоит restrict, поэтому первым уходит их набор. */
  private async deleteTasks(tx: Transaction, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await tx.delete(summaryTaskPlatforms).where(inArray(summaryTaskPlatforms.draftId, ids));
    await tx.delete(summaryTaskDrafts).where(inArray(summaryTaskDrafts.id, ids));
  }

  /**
   * Саммари проекта из адреса под правом записи на «Хронику».
   *
   * Основа чтения, правки черновика и шага релиза. Чужое саммари
   * выглядит несуществующим — выборка по `(id, project_id)`, как
   * `requireEntry` в хронике: `403` сообщил бы, что объект существует.
   */
  async requireForWrite(
    subject: RequestSubject,
    executor: Executor,
    projectId: string,
    summaryId: string,
  ): Promise<SummaryRow> {
    await this.requireWrite(subject, projectId, executor);

    const [row] = await executor
      .select()
      .from(summaries)
      .where(and(eq(summaries.id, summaryId), eq(summaries.projectId, projectId)))
      .limit(1);

    if (!row) {
      throw new SectionNotVisibleError();
    }

    return row;
  }

  /** Право, которым открывается весь поток. */
  private async requireWrite(
    subject: RequestSubject,
    projectId: string,
    executor: Executor,
  ): Promise<void> {
    await this.access.requireLevel(
      subject,
      projectId,
      Section.Chronicle,
      AccessLevel.Write,
      executor,
    );
  }

  /** Собирает деталь: текст записи, черновик и данные роадмапа по праву. */
  private async detailOf(
    subject: RequestSubject,
    executor: Executor,
    row: SummaryRow,
  ): Promise<SummaryDetail> {
    const [entry] = await executor
      .select({
        title: chronicleEntries.title,
        occurredOn: chronicleEntries.occurredOn,
        content: chronicleEntries.content,
        updatedAt: chronicleEntries.updatedAt,
      })
      .from(chronicleEntries)
      .where(eq(chronicleEntries.id, row.chronicleEntryId))
      .limit(1);

    if (!entry) {
      // Ссылка `not null` с `restrict`: записи не стало бы только вместе
      // с саммари. Проверка охраняет инвариант, а не ожидаемый случай.
      throw new SectionNotVisibleError();
    }

    const [project] = await executor
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, row.projectId))
      .limit(1);

    const tasks = await this.tasksOf(executor, row.id);
    const job = await latestOf(executor, row.id);
    // Уровень роадмапа резолвится один раз на сборку детали: три поля
    // того же гейта дали бы три запроса прав, а деталь собирается на
    // каждое сохранение черновика (дизайн, 6.3).
    const roadmapLevel = await this.access.resolveLevel(
      subject,
      row.projectId,
      Section.Roadmap,
      executor,
    );
    const seesRoadmap = meets(roadmapLevel ?? undefined, AccessLevel.Metadata);
    const seesTasks = meets(roadmapLevel ?? undefined, AccessLevel.Read);
    const labels = await this.releasedLabels(
      row.projectId,
      [row.releasedVersionId, ...tasks.map((task) => task.releasedVersionId)],
      executor,
      seesRoadmap,
    );

    return {
      id: row.id,
      projectId: row.projectId,
      projectName: project?.name ?? '',
      occurredOn: entry.occurredOn,
      title: entry.title,
      ...countsOf(
        tasks.reduce<Partial<Record<SummaryTaskState, number>>>((counts, task) => {
          counts[task.state] = (counts[task.state] ?? 0) + 1;
          return counts;
        }, {}),
      ),
      isReleased: row.releasedVersionId !== null,
      ...releasedOf(row.releasedVersionId, labels),
      createdAt: row.createdAt.toISOString(),
      chronicleEntryId: row.chronicleEntryId,
      text: entry.content,
      tasks: tasks.map((task) => ({
        ...task,
        taskId: seesTasks ? (task.taskId ?? null) : null,
        ...releasedOf(task.releasedVersionId, labels),
      })),
      suggester: stampOf(row),
      // Грубо намеренно: `updated_at` двигает любая правка записи, включая
      // правку одного заголовка. Точность стоила бы копии текста в базе —
      // ровно той второй правды, от которой избавляет её отсутствие
      // (дизайн, раздел 2.5).
      isTextStale:
        row.suggestedTextAt !== null && entry.updatedAt.getTime() > row.suggestedTextAt.getTime(),
      suggestedVersionLabel: await this.suggestedLabel(
        subject,
        row.projectId,
        executor,
        seesRoadmap,
      ),
      platforms: await this.platformsOf(subject, row.projectId, executor, seesRoadmap),
      // Два вычисляемых поля из последней задачи расшифровки: своих
      // колонок под запись у `summaries` не появилось, и это главное
      // решение дизайна расшифровки (2.2). Правка проекции, не схемы.
      //
      // Выдача не проверяется второй раз: задача принадлежит тому же
      // проекту, и право на неё — то же `Chronicle ≥ write`, которое уже
      // потребовал `requireForWrite` выше.
      recording: recordingOf(job),
      transcription: job === null ? null : jobProjectionOf(job, project?.name ?? ''),
    };
  }

  /**
   * Платформы проекта для чипов тегов — только при `Roadmap ≥ metadata`.
   *
   * Пустой список означает «показывать нечего» и накрывает два случая
   * намеренно неотличимо: у проекта нет платформ либо у субъекта нет
   * выдачи на роадмап. Отличимость второго и была бы утечкой признака
   * (дизайн, 3.2).
   */
  private async platformsOf(
    subject: RequestSubject,
    projectId: string,
    executor: Executor,
    seesRoadmap: boolean,
  ): Promise<Platform[]> {
    if (!seesRoadmap) {
      return [];
    }

    return this.roadmap.platformsForProject(subject, projectId, executor);
  }

  /** Число задач по каждому саммари — одним запросом, а не N+1. */
  private async taskCounts(
    executor: Executor,
    summaryIds: string[],
  ): Promise<Map<string, Partial<Record<SummaryTaskState, number>>>> {
    if (summaryIds.length === 0) {
      return new Map();
    }

    const rows = await executor
      .select({
        summaryId: summaryTaskDrafts.summaryId,
        state: summaryTaskDrafts.state,
        total: count(),
      })
      .from(summaryTaskDrafts)
      .where(inArray(summaryTaskDrafts.summaryId, summaryIds))
      .groupBy(summaryTaskDrafts.summaryId, summaryTaskDrafts.state);

    const counts = new Map<string, Partial<Record<SummaryTaskState, number>>>();
    for (const row of rows) {
      counts.set(row.summaryId, { ...counts.get(row.summaryId), [row.state]: row.total });
    }
    return counts;
  }

  /**
   * Обозначения версий-получателей — только при `Roadmap ≥ metadata`.
   *
   * Без выдачи на роадмап карта пуста, и «ушло в роадмап» остаётся видно
   * само по себе: это состояние потока, а не данные роадмапа.
   *
   * Признак видимости приходит параметром: его резолвит вызывающая
   * сторона один раз на всю сборку — иначе каждое поле того же гейта
   * добавляло бы свой запрос прав (дизайн, 6.3).
   */
  private async releasedLabels(
    projectId: string,
    versionIds: (string | null)[],
    executor: Executor,
    seesRoadmap: boolean,
  ): Promise<Map<string, string>> {
    const ids = [...new Set(versionIds.filter((id): id is string => id !== null))];

    if (ids.length === 0) {
      return new Map();
    }

    if (!seesRoadmap) {
      return new Map();
    }

    const rows = await executor
      .select({ id: roadmapVersions.id, label: roadmapVersions.label })
      .from(roadmapVersions)
      .where(and(eq(roadmapVersions.projectId, projectId), inArray(roadmapVersions.id, ids)));

    return new Map(rows.map((row) => [row.id, row.label]));
  }

  /**
   * Подсказка следующего обозначения версии либо `null`.
   *
   * `null` значит «подставлять нечего»: версий нет, в обозначениях нет
   * цифр, или у субъекта нет выдачи на роадмап.
   */
  private async suggestedLabel(
    subject: RequestSubject,
    projectId: string,
    executor: Executor,
    seesRoadmap: boolean,
  ): Promise<string | null> {
    if (!seesRoadmap) {
      return null;
    }

    return nextVersionLabel(await this.roadmap.labelsForProject(subject, projectId, executor));
  }

  /** Видны ли субъекту обозначения версий проекта. */
  private async seesRoadmap(
    subject: RequestSubject,
    projectId: string,
    executor: Executor,
  ): Promise<boolean> {
    const level = await this.access.resolveLevel(subject, projectId, Section.Roadmap, executor);
    return meets(level ?? undefined, AccessLevel.Metadata);
  }
}

function countsOf(counts: Partial<Record<SummaryTaskState, number>> = {}) {
  return {
    taskCount: counts[SummaryTaskState.Active] ?? 0,
    archivedCount: counts[SummaryTaskState.Archived] ?? 0,
    releasedCount: counts[SummaryTaskState.Released] ?? 0,
  };
}

function taskNotActive(): ConflictException {
  return new ConflictException({
    code: SUMMARY_TASK_NOT_ACTIVE,
    message: 'Состояние задачи не допускает выбранного действия.',
  });
}

/**
 * Версия-получатель в выдаче: обе её части разом.
 *
 * Идентификатор подчиняется тому же правилу, что обозначение, и берётся
 * из той же карты: без выдачи на «Роадмап» она пуста, и в ответ не уходит
 * ни то, ни другое — ссылка на версию закрытой секции вела бы в `404`.
 * «Ушло в роадмап» при этом остаётся видно: это состояние потока, а не
 * данные роадмапа.
 */
function releasedOf(
  versionId: string | null,
  labels: Map<string, string>,
): { releasedVersionId: string | null; releasedVersionLabel: string | null } {
  const label = versionId === null ? undefined : labels.get(versionId);

  return {
    releasedVersionId: label === undefined ? null : versionId,
    releasedVersionLabel: label ?? null,
  };
}

/**
 * Запись созвона у саммари либо `null`.
 *
 * Запись — это **дорожка**: её человек слушает, и она хранится, пока живёт
 * саммари. Пустой `audio_path` означает «слушать нечего»: либо текст
 * вставили руками, либо расшифровка ещё не дошла до дорожки.
 *
 * `isSourceRemoved` вычисляется как «исходника нет, а дорожка есть», и
 * гадать по типу содержимого нельзя: загруженный `mp3` мог и
 * перекодироваться, если был крупным (дизайн, 3.3).
 */
function recordingOf(job: TranscriptionJobRow | null): SummaryDetail['recording'] {
  if (job === null || job.audioPath === null || job.audioBytes === null || job.audioBytes <= 0) {
    return null;
  }

  return {
    bytes: job.audioBytes,
    mediaType: job.audioType ?? 'audio/ogg',
    uploadBytes: job.uploadBytes,
    uploadType: job.uploadType,
    isSourceRemoved: job.uploadPath === null,
    uploadedAt: job.startedAt.toISOString(),
  };
}

/** Отметка «чем и когда построена разбивка»; до разбивки её нет. */
function stampOf(row: SummaryRow): SummaryDetail['suggester'] {
  if (!row.suggesterName || !row.suggesterModel || !row.suggestedAt) {
    return null;
  }

  return {
    name: row.suggesterName,
    model: row.suggesterModel,
    at: row.suggestedAt.toISOString(),
    dropped: row.suggesterDropped,
  };
}
