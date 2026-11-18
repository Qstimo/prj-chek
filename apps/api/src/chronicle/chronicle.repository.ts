import {
  AccessLevel,
  ChronicleSource,
  Section,
  type ChronicleDetail,
  type ChronicleEntryCreate,
  type ChronicleEntryUpdate,
  type ChronicleMetadata,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { SectionNotVisibleError } from '../access/access.errors';
import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { DATABASE } from '../db/db.module';
import type { Database, Executor, Transaction } from '../db/db.types';
import {
  chronicleEntries,
  summaries,
  summaryTaskDrafts,
  summaryTaskPlatforms,
  transcriptionJobs,
  type ChronicleEntry,
} from '../db/schema';
import { mediaPathsOf } from '../summaries/transcription/media-paths';
import { chronicleProjection } from './chronicle.projection';

/**
 * Доступ к записям хроники.
 *
 * Каждый метод принимает субъект первым аргументом и проверяет права сам
 * (спека 5.4). Через этот же репозиторий пишет приёмный канал: машинный
 * субъект проходит ту же проверку, что и человек (ТЗ 2).
 */
@Injectable()
export class ChronicleRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly access: AccessService,
  ) {}

  /** Лента проекта в проекции по уровню: свежие события сверху. */
  async findForProject(
    subject: RequestSubject,
    projectId: string,
  ): Promise<(ChronicleMetadata | ChronicleDetail)[]> {
    const level = await this.access.requireLevel(
      subject,
      projectId,
      Section.Chronicle,
      AccessLevel.Metadata,
    );

    const rows = await this.db
      .select()
      .from(chronicleEntries)
      .where(eq(chronicleEntries.projectId, projectId))
      .orderBy(desc(chronicleEntries.occurredOn), desc(chronicleEntries.createdAt));

    return rows.map((row) => chronicleProjection(row, level));
  }

  /** Одна запись в проекции по уровню. */
  async findById(
    subject: RequestSubject,
    projectId: string,
    entryId: string,
  ): Promise<ChronicleMetadata | ChronicleDetail> {
    const level = await this.access.requireLevel(
      subject,
      projectId,
      Section.Chronicle,
      AccessLevel.Metadata,
    );

    return chronicleProjection(await this.requireEntry(this.db, projectId, entryId), level);
  }

  /** Создаёт запись от лица субъекта: человека или приёмного адреса. */
  async create(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    input: ChronicleEntryCreate,
    source: ChronicleSource = ChronicleSource.Manual,
  ): Promise<ChronicleEntry> {
    await this.access.requireLevel(subject, projectId, Section.Chronicle, AccessLevel.Write, tx);

    const [created] = await tx
      .insert(chronicleEntries)
      .values({ ...input, projectId, source, createdBySubjectId: subject.id })
      .returning();

    return created!;
  }

  /** Изменяет запись. Источник не правится: он описывает происхождение. */
  async update(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    entryId: string,
    input: ChronicleEntryUpdate,
  ): Promise<ChronicleEntry> {
    await this.access.requireLevel(subject, projectId, Section.Chronicle, AccessLevel.Write, tx);
    await this.requireEntry(tx, projectId, entryId);

    const [updated] = await tx
      .update(chronicleEntries)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(chronicleEntries.id, entryId))
      .returning();

    return updated!;
  }

  /**
   * Удаляет запись и возвращает её: журналу нужны заголовок и дата.
   *
   * Плюс пути файлов созвонов, если за записью стояло саммари с
   * расшифровками: удалять их здесь нельзя — `unlink` не откатывается, и
   * обратный порядок унёс бы запись у саммари, удаление которого потом
   * откатилось.
   */
  async remove(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    entryId: string,
  ): Promise<ChronicleEntry & { mediaPaths: string[] }> {
    await this.access.requireLevel(subject, projectId, Section.Chronicle, AccessLevel.Write, tx);

    const entry = await this.requireEntry(tx, projectId, entryId);
    let mediaPaths: string[] = [];

    // Саммари ссылается на запись `restrict`, каскадов в проекте нет:
    // без явной уборки запись с саммари стала бы неудаляемой. Отдельной
    // записи в журнал удаление саммари не получает — человек удалял
    // запись хроники, и журнал обязан описывать то, что он сделал.
    const linked = await tx
      .select({ id: summaries.id })
      .from(summaries)
      .where(eq(summaries.chronicleEntryId, entryId));

    if (linked.length > 0) {
      const ids = linked.map((row) => row.id);

      // Теги черновика уносятся своим кодом, а не вызовом
      // `SummariesRepository`: тот уже зависит от этого репозитория, и
      // обратная зависимость замкнула бы круг в инжекторе.
      const drafts = await tx
        .select({ id: summaryTaskDrafts.id })
        .from(summaryTaskDrafts)
        .where(inArray(summaryTaskDrafts.summaryId, ids));

      if (drafts.length > 0) {
        await tx.delete(summaryTaskPlatforms).where(
          inArray(
            summaryTaskPlatforms.draftId,
            drafts.map((row) => row.id),
          ),
        );
      }

      await tx.delete(summaryTaskDrafts).where(inArray(summaryTaskDrafts.summaryId, ids));

      // Задачи расшифровки — дети саммари, и без них удаление упёрлось бы
      // в целостность. Пути их файлов возвращаются вызывающему: `unlink`
      // идёт после фиксации транзакции, не внутри (дизайн, 2.5 пункт 4).
      const jobs = await tx
        .select({
          uploadPath: transcriptionJobs.uploadPath,
          audioPath: transcriptionJobs.audioPath,
        })
        .from(transcriptionJobs)
        .where(inArray(transcriptionJobs.summaryId, ids));

      mediaPaths = mediaPathsOf(jobs);

      await tx.delete(transcriptionJobs).where(inArray(transcriptionJobs.summaryId, ids));
      await tx.delete(summaries).where(inArray(summaries.id, ids));
    }

    await tx.delete(chronicleEntries).where(eq(chronicleEntries.id, entryId));

    return { ...entry, mediaPaths };
  }

  /** Находит запись, принадлежащую проекту; чужая выглядит несуществующей. */
  private async requireEntry(
    executor: Executor,
    projectId: string,
    entryId: string,
  ): Promise<ChronicleEntry> {
    const [entry] = await executor
      .select()
      .from(chronicleEntries)
      .where(and(eq(chronicleEntries.id, entryId), eq(chronicleEntries.projectId, projectId)))
      .limit(1);

    if (!entry) {
      throw new SectionNotVisibleError();
    }

    return entry;
  }
}
