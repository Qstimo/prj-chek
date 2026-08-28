import {
  AccessLevel,
  Section,
  type DocPageCreate,
  type DocPageDetail,
  type DocPageMetadata,
  type DocPageUpdate,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';

import { SectionNotVisibleError } from '../access/access.errors';
import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { DATABASE } from '../db/db.module';
import type { Database, Executor, Transaction } from '../db/db.types';
import { docPages, type DocPageRow } from '../db/schema';
import { docPageProjection } from './doc.projection';

/**
 * Доступ к страницам документации (ТЗ 3.4).
 *
 * Каждый метод принимает субъект первым аргументом и проверяет права сам
 * (спека 5.4). Чужая страница выглядит несуществующей.
 */
@Injectable()
export class DocsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly access: AccessService,
  ) {}

  /** Список страниц проекта по алфавиту, в проекции по уровню. */
  async findForProject(
    subject: RequestSubject,
    projectId: string,
  ): Promise<(DocPageMetadata | DocPageDetail)[]> {
    const level = await this.access.requireLevel(
      subject,
      projectId,
      Section.Docs,
      AccessLevel.Metadata,
    );

    const rows = await this.db
      .select()
      .from(docPages)
      .where(eq(docPages.projectId, projectId))
      .orderBy(asc(docPages.title));

    return rows.map((row) => docPageProjection(row, level));
  }

  /** Одна страница в проекции по уровню. */
  async findById(
    subject: RequestSubject,
    projectId: string,
    pageId: string,
  ): Promise<DocPageMetadata | DocPageDetail> {
    const level = await this.access.requireLevel(
      subject,
      projectId,
      Section.Docs,
      AccessLevel.Metadata,
    );

    return docPageProjection(await this.requirePage(this.db, projectId, pageId), level);
  }

  /** Создаёт страницу. */
  async create(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    input: DocPageCreate,
  ): Promise<DocPageRow> {
    await this.access.requireLevel(subject, projectId, Section.Docs, AccessLevel.Write, tx);

    const [created] = await tx
      .insert(docPages)
      .values({ ...input, projectId, createdBySubjectId: subject.id })
      .returning();

    return created!;
  }

  /** Правит страницу: заголовок и содержимое. */
  async update(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    pageId: string,
    input: DocPageUpdate,
  ): Promise<DocPageRow> {
    await this.access.requireLevel(subject, projectId, Section.Docs, AccessLevel.Write, tx);
    await this.requirePage(tx, projectId, pageId);

    const [updated] = await tx
      .update(docPages)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(docPages.id, pageId))
      .returning();

    return updated!;
  }

  /** Удаляет страницу и возвращает её: журналу нужен заголовок. */
  async remove(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    pageId: string,
  ): Promise<DocPageRow> {
    await this.access.requireLevel(subject, projectId, Section.Docs, AccessLevel.Write, tx);

    const page = await this.requirePage(tx, projectId, pageId);

    await tx.delete(docPages).where(eq(docPages.id, pageId));

    return page;
  }

  /** Страница обязана принадлежать проекту из адреса. */
  private async requirePage(
    executor: Executor,
    projectId: string,
    pageId: string,
  ): Promise<DocPageRow> {
    const [page] = await executor
      .select()
      .from(docPages)
      .where(and(eq(docPages.id, pageId), eq(docPages.projectId, projectId)))
      .limit(1);

    if (!page) {
      throw new SectionNotVisibleError();
    }

    return page;
  }
}
