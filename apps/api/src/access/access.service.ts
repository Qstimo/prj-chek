import { AccessLevel, Section, type SectionLevels } from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { DATABASE } from '../db/db.module';
import type { Database, Executor } from '../db/db.types';
import { grants, projects } from '../db/schema';
import { InsufficientLevelError, SectionNotVisibleError } from './access.errors';
import type { RequestSubject } from './access.types';

/**
 * Единая проверка прав (ТЗ 4.1).
 *
 * Отвечает только за доступ к содержимому проектов. Право управлять самой
 * системой доступа — принадлежность суперадмина и проверяется отдельным
 * guard'ом, а не здесь (спека 8).
 *
 * Каждый метод принимает необязательного исполнителя запроса. Вызванный
 * внутри транзакции, он обязан получить именно её: иначе проверка уйдёт
 * за другим подключением из пула и увидит состояние до транзакции,
 * а при исчерпанном пуле — повиснет, ожидая свободного подключения.
 */
@Injectable()
export class AccessService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Возвращает уровень доступа субъекта к секции проекта либо `null`,
   * если доступа нет вовсе.
   */
  async resolveLevel(
    subject: RequestSubject,
    projectId: string,
    section: Section,
    executor: Executor = this.db,
  ): Promise<AccessLevel | null> {
    // Отзыв сильнее суперадминства, иначе отозвать администратора было бы нечем.
    if (subject.isRevoked) {
      return null;
    }

    if (subject.isSuperadmin) {
      return AccessLevel.Write;
    }

    const [grant] = await executor
      .select({ level: grants.level })
      .from(grants)
      .where(
        and(
          eq(grants.subjectId, subject.id),
          eq(grants.projectId, projectId),
          eq(grants.section, section),
        ),
      )
      .limit(1);

    return grant?.level ?? null;
  }

  /**
   * Возвращает идентификаторы проектов, доступных субъекту хотя бы на уровне
   * метаданных хотя бы в одной секции.
   *
   * Возвращается массив, а не подзапрос: сервис прав не должен протекать
   * деталями хранения в вызывающий код (спека 5.2).
   */
  async visibleProjectIds(
    subject: RequestSubject,
    executor: Executor = this.db,
  ): Promise<string[]> {
    if (subject.isRevoked) {
      return [];
    }

    if (subject.isSuperadmin) {
      const rows = await executor.select({ id: projects.id }).from(projects);

      return rows.map((row) => row.id);
    }

    const rows = await executor
      .selectDistinct({ projectId: grants.projectId })
      .from(grants)
      .where(eq(grants.subjectId, subject.id));

    return rows.map((row) => row.projectId);
  }

  /**
   * Возвращает уровни субъекта по секциям проекта.
   *
   * Нужен интерфейсу: по данным, прошедшим проекцию, нельзя отличить
   * уровень чтения от уровня записи, а значит нельзя решить, показывать ли
   * кнопки правки (спека этапа 2, 6.1).
   *
   * Секции без выдачи в карту не попадают.
   */
  async levelsForProject(
    subject: RequestSubject,
    projectId: string,
    executor: Executor = this.db,
  ): Promise<SectionLevels> {
    if (subject.isRevoked) {
      return {};
    }

    if (subject.isSuperadmin) {
      return Object.fromEntries(
        Object.values(Section).map((section) => [section, AccessLevel.Write]),
      );
    }

    const rows = await executor
      .select({ section: grants.section, level: grants.level })
      .from(grants)
      .where(and(eq(grants.subjectId, subject.id), eq(grants.projectId, projectId)));

    return Object.fromEntries(rows.map((row) => [row.section, row.level]));
  }

  /**
   * Требует уровень не ниже указанного.
   *
   * Бросает {@link SectionNotVisibleError} при отсутствии доступа и
   * {@link InsufficientLevelError} при недостаточном уровне (спека 5.3).
   */
  async requireLevel(
    subject: RequestSubject,
    projectId: string,
    section: Section,
    minimum: AccessLevel,
    executor: Executor = this.db,
  ): Promise<AccessLevel> {
    const level = await this.resolveLevel(subject, projectId, section, executor);

    if (level === null) {
      throw new SectionNotVisibleError();
    }

    if (LEVEL_ORDER[level] < LEVEL_ORDER[minimum]) {
      throw new InsufficientLevelError();
    }

    return level;
  }
}

/** Порядок уровней для сравнения. Строки перечисления сравнивать нельзя. */
const LEVEL_ORDER: Record<AccessLevel, number> = {
  [AccessLevel.Metadata]: 1,
  [AccessLevel.Read]: 2,
  [AccessLevel.Write]: 3,
};
