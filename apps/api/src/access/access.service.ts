import { AccessLevel, Section, type SectionLevels } from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { DATABASE } from '../db/db.module';
import type { Database, Executor } from '../db/db.types';
import { grants, projects, subjects, users } from '../db/schema';
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
    const map = await this.levelsForProjects(subject, [projectId], executor);

    return map.get(projectId) ?? {};
  }

  /**
   * Уровни по секциям для набора проектов — одним запросом.
   *
   * Нужен сводке: обогащать каждый проект своим `levelsForProject`
   * значило бы N+1 на каждый открытый реестр.
   */
  async levelsForProjects(
    subject: RequestSubject,
    projectIds: string[],
    executor: Executor = this.db,
  ): Promise<Map<string, SectionLevels>> {
    const result = new Map<string, SectionLevels>();

    if (subject.isRevoked || projectIds.length === 0) {
      return result;
    }

    if (subject.isSuperadmin) {
      const full = Object.fromEntries(
        Object.values(Section).map((section) => [section, AccessLevel.Write]),
      ) as SectionLevels;

      for (const projectId of projectIds) {
        result.set(projectId, full);
      }

      return result;
    }

    const rows = await executor
      .select({
        projectId: grants.projectId,
        section: grants.section,
        level: grants.level,
      })
      .from(grants)
      .where(and(eq(grants.subjectId, subject.id), inArray(grants.projectId, projectIds)));

    for (const row of rows) {
      const current = result.get(row.projectId) ?? {};
      current[row.section] = row.level;
      result.set(row.projectId, current);
    }

    return result;
  }

  /**
   * Субъекты, которым секция проекта видна не ниже указанного уровня.
   *
   * Обратное направление к {@link levelsForProject}: тот отвечает «что
   * видит этот субъект», этот — «кто видит это». Нужен рассылке
   * уведомлений, и именно он делает ненужным второй список адресатов:
   * право видеть статус и есть право узнать о падении.
   *
   * Суперадмины попадают без выдачи, отозванные не попадают вовсе.
   */
  async subjectsWithLevel(
    projectId: string,
    section: Section,
    minimum: AccessLevel,
    executor: Executor = this.db,
  ): Promise<string[]> {
    const allowed = Object.values(AccessLevel).filter(
      (level) => LEVEL_ORDER[level] >= LEVEL_ORDER[minimum],
    );

    const granted = await executor
      .selectDistinct({ subjectId: grants.subjectId })
      .from(grants)
      .innerJoin(subjects, eq(subjects.id, grants.subjectId))
      .where(
        and(
          eq(grants.projectId, projectId),
          eq(grants.section, section),
          inArray(grants.level, allowed),
          isNull(subjects.revokedAt),
        ),
      );

    const superadmins = await executor
      .select({ subjectId: users.subjectId })
      .from(users)
      .innerJoin(subjects, eq(subjects.id, users.subjectId))
      .where(and(eq(users.isSuperadmin, true), isNull(subjects.revokedAt)));

    return [
      ...new Set([
        ...granted.map((row) => row.subjectId),
        ...superadmins.map((row) => row.subjectId),
      ]),
    ];
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
