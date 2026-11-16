import {
  AccessLevel,
  ChronicleSource,
  Section,
  type SummaryCreate,
  type SummaryDetail,
  type SummaryListItem,
  type SummaryTask,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';

import { SectionNotVisibleError } from '../access/access.errors';
import { AccessService, meets } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { ChronicleRepository } from '../chronicle/chronicle.repository';
import { DATABASE } from '../db/db.module';
import type { Database, Executor, Transaction } from '../db/db.types';
import {
  chronicleEntries,
  projects,
  roadmapVersions,
  summaries,
  summaryTaskDrafts,
  type SummaryRow,
} from '../db/schema';
import { RoadmapRepository } from '../roadmap/roadmap.repository';
import { nextVersionLabel } from './next-version-label';

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
      subject,
      projectId,
      rows.map((row) => row.summary.releasedVersionId),
      executor,
    );

    return rows.map((row) => ({
      id: row.summary.id,
      projectId: row.summary.projectId,
      projectName: row.projectName,
      occurredOn: row.occurredOn,
      title: row.title,
      taskCount: counts.get(row.summary.id) ?? 0,
      isReleased: row.summary.releasedVersionId !== null,
      releasedVersionLabel: row.summary.releasedVersionId
        ? labels.get(row.summary.releasedVersionId) ?? null
        : null,
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
  ): Promise<SummaryDetail> {
    const row = await this.requireForWrite(subject, tx, projectId, summaryId);
    const detail = await this.detailOf(subject, tx, row);

    await tx.delete(summaryTaskDrafts).where(eq(summaryTaskDrafts.summaryId, summaryId));
    await tx.delete(summaries).where(eq(summaries.id, summaryId));

    return detail;
  }

  /**
   * Задачи черновика по порядку позиций.
   *
   * Субъекта не принимает намеренно: единственный путь сюда — через
   * {@link requireForWrite}, который право уже потребовал тем же
   * исполнителем. Второй проверкой здесь был бы лишний запрос на каждую
   * сборку детали.
   */
  async tasksOf(executor: Executor, summaryId: string): Promise<SummaryTask[]> {
    const rows = await executor
      .select()
      .from(summaryTaskDrafts)
      .where(eq(summaryTaskDrafts.summaryId, summaryId))
      .orderBy(asc(summaryTaskDrafts.position));

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      position: row.position,
      origin: row.origin,
    }));
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
    const labels = await this.releasedLabels(
      subject,
      row.projectId,
      [row.releasedVersionId],
      executor,
    );

    return {
      id: row.id,
      projectId: row.projectId,
      projectName: project?.name ?? '',
      occurredOn: entry.occurredOn,
      title: entry.title,
      taskCount: tasks.length,
      isReleased: row.releasedVersionId !== null,
      releasedVersionLabel: row.releasedVersionId
        ? labels.get(row.releasedVersionId) ?? null
        : null,
      createdAt: row.createdAt.toISOString(),
      chronicleEntryId: row.chronicleEntryId,
      text: entry.content,
      tasks,
      suggester: stampOf(row),
      releasedVersionId: row.releasedVersionId,
      // Грубо намеренно: `updated_at` двигает любая правка записи, включая
      // правку одного заголовка. Точность стоила бы копии текста в базе —
      // ровно той второй правды, от которой избавляет её отсутствие
      // (дизайн, раздел 2.5).
      isTextStale:
        row.suggestedTextAt !== null && entry.updatedAt.getTime() > row.suggestedTextAt.getTime(),
      suggestedVersionLabel: await this.suggestedLabel(subject, row.projectId, executor),
    };
  }

  /** Число задач по каждому саммари — одним запросом, а не N+1. */
  private async taskCounts(
    executor: Executor,
    summaryIds: string[],
  ): Promise<Map<string, number>> {
    if (summaryIds.length === 0) {
      return new Map();
    }

    const rows = await executor
      .select({ summaryId: summaryTaskDrafts.summaryId, total: count() })
      .from(summaryTaskDrafts)
      .where(inArray(summaryTaskDrafts.summaryId, summaryIds))
      .groupBy(summaryTaskDrafts.summaryId);

    return new Map(rows.map((row) => [row.summaryId, Number(row.total)]));
  }

  /**
   * Обозначения версий-получателей — только при `Roadmap ≥ metadata`.
   *
   * Без выдачи на роадмап карта пуста, и «ушло в роадмап» остаётся видно
   * само по себе: это состояние потока, а не данные роадмапа.
   */
  private async releasedLabels(
    subject: RequestSubject,
    projectId: string,
    versionIds: (string | null)[],
    executor: Executor,
  ): Promise<Map<string, string>> {
    const ids = [...new Set(versionIds.filter((id): id is string => id !== null))];

    if (ids.length === 0) {
      return new Map();
    }

    if (!(await this.seesRoadmap(subject, projectId, executor))) {
      return new Map();
    }

    const rows = await executor
      .select({ id: roadmapVersions.id, label: roadmapVersions.label })
      .from(roadmapVersions)
      .where(inArray(roadmapVersions.id, ids));

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
  ): Promise<string | null> {
    if (!(await this.seesRoadmap(subject, projectId, executor))) {
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

/** Отметка «чем и когда построена разбивка»; до разбивки её нет. */
function stampOf(row: SummaryRow): SummaryDetail['suggester'] {
  if (!row.suggesterName || !row.suggesterModel || !row.suggestedAt) {
    return null;
  }

  return {
    name: row.suggesterName,
    model: row.suggesterModel,
    at: row.suggestedAt.toISOString(),
  };
}
