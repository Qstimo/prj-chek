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
import { and, desc, eq } from 'drizzle-orm';

import { SectionNotVisibleError } from '../access/access.errors';
import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { DATABASE } from '../db/db.module';
import type { Database, Executor, Transaction } from '../db/db.types';
import { chronicleEntries, type ChronicleEntry } from '../db/schema';
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

  /** Удаляет запись и возвращает её: журналу нужны заголовок и дата. */
  async remove(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    entryId: string,
  ): Promise<ChronicleEntry> {
    await this.access.requireLevel(subject, projectId, Section.Chronicle, AccessLevel.Write, tx);

    const entry = await this.requireEntry(tx, projectId, entryId);

    await tx.delete(chronicleEntries).where(eq(chronicleEntries.id, entryId));

    return entry;
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
