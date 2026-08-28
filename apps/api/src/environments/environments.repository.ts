import {
  AccessLevel,
  Section,
  type EnvironmentCreate,
  type EnvironmentDetail,
  type EnvironmentMetadata,
  type EnvironmentUpdate,
} from '@cairn/shared';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';

import { SectionNotVisibleError } from '../access/access.errors';
import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { DATABASE } from '../db/db.module';
import type { Database, Executor, Transaction } from '../db/db.types';
import {
  domainStatuses,
  environmentDomains,
  environmentStatuses,
  environments,
  variables,
  type Environment,
} from '../db/schema';
import { environmentProjection } from './environment.projection';

/**
 * Доступ к окружениям проекта.
 *
 * Каждый метод принимает субъект первым аргументом и проверяет права сам:
 * отдельного вызова проверки, который можно забыть, не существует (спека 5.4).
 *
 * Методы записи принимают транзакцию, потому что сервис пишет в журнал
 * в той же транзакции (спека 7.3).
 */
@Injectable()
export class EnvironmentsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly access: AccessService,
  ) {}

  /**
   * Возвращает окружения проекта в проекции, соответствующей уровню.
   *
   * Проекция здесь по уровню, а не всегда метаданных, как в списке проектов:
   * этот список и есть экран секции, и второй запрос за теми же данными
   * был бы лишним.
   */
  async findForProject(
    subject: RequestSubject,
    projectId: string,
  ): Promise<(EnvironmentMetadata | EnvironmentDetail)[]> {
    const level = await this.access.requireLevel(
      subject,
      projectId,
      Section.Infrastructure,
      AccessLevel.Metadata,
    );

    const rows = await this.db
      .select()
      .from(environments)
      .where(eq(environments.projectId, projectId))
      // Порядок значений перечисления в базе — от прода к прочему,
      // поэтому сортировка по нему ставит прод первым без отдельного поля.
      .orderBy(asc(environments.kind), asc(environments.name));

    const domains = await this.domainsOf(rows.map((row) => row.id));

    return rows.map((row) => environmentProjection(row, domains.get(row.id) ?? [], level));
  }

  /** Возвращает окружение проекта в проекции, соответствующей уровню. */
  async findById(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
  ): Promise<EnvironmentMetadata | EnvironmentDetail> {
    const level = await this.access.requireLevel(
      subject,
      projectId,
      Section.Infrastructure,
      AccessLevel.Metadata,
    );

    const environment = await this.requireEnvironment(this.db, projectId, environmentId);
    const domains = await this.domainsOf([environmentId]);

    return environmentProjection(environment, domains.get(environmentId) ?? [], level);
  }

  /** Создаёт окружение вместе с его доменами. */
  async create(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    input: EnvironmentCreate,
  ): Promise<Environment> {
    await this.access.requireLevel(
      subject,
      projectId,
      Section.Infrastructure,
      AccessLevel.Write,
      tx,
    );

    const { domains, ...fields } = input;

    const [created] = await tx
      .insert(environments)
      .values({ ...fields, projectId })
      .returning();

    await this.replaceDomains(tx, created!.id, domains ?? []);

    return created!;
  }

  /**
   * Изменяет окружение.
   *
   * Домены заменяются целиком, но только если поле передано: правка одного
   * лишь провайдера не должна стирать адреса.
   */
  async update(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    environmentId: string,
    input: EnvironmentUpdate,
  ): Promise<Environment> {
    await this.access.requireLevel(
      subject,
      projectId,
      Section.Infrastructure,
      AccessLevel.Write,
      tx,
    );

    await this.requireEnvironment(tx, projectId, environmentId);

    const { domains, ...fields } = input;

    const [updated] = await tx
      .update(environments)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(environments.id, environmentId))
      .returning();

    if (domains) {
      await this.replaceDomains(tx, environmentId, domains);
    }

    return updated!;
  }

  /**
   * Удаляет окружение вместе с доменами и возвращает удалённую строку.
   *
   * Домены удаляются явно, а не каскадом: запрет каскадов в системе
   * абсолютный и проверяется тестом инвариантов (спека этапа 1, 4.1).
   */
  async remove(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    environmentId: string,
  ): Promise<Environment> {
    await this.access.requireLevel(
      subject,
      projectId,
      Section.Infrastructure,
      AccessLevel.Write,
      tx,
    );

    const environment = await this.requireEnvironment(tx, projectId, environmentId);

    // Обещание спеки этапа 2: удаление окружения не уносит секреты тихо.
    // Ключ restrict страхует на уровне базы, но человеку нужен внятный отказ.
    const [variable] = await tx
      .select({ id: variables.id })
      .from(variables)
      .where(eq(variables.environmentId, environmentId))
      .limit(1);

    if (variable) {
      throw new ConflictException(
        'У окружения есть переменные. Сначала удалите их в секции «Переменные».',
      );
    }

    // Статусы — производные данные и не переживают своё окружение.
    const domains = await tx
      .select({ id: environmentDomains.id })
      .from(environmentDomains)
      .where(eq(environmentDomains.environmentId, environmentId));

    if (domains.length > 0) {
      await tx.delete(domainStatuses).where(
        inArray(
          domainStatuses.domainId,
          domains.map((domain) => domain.id),
        ),
      );
    }

    await tx
      .delete(environmentStatuses)
      .where(eq(environmentStatuses.environmentId, environmentId));
    await tx.delete(environmentDomains).where(eq(environmentDomains.environmentId, environmentId));
    await tx.delete(environments).where(eq(environments.id, environmentId));

    return environment;
  }

  /** Возвращает домены окружений, сгруппированные по окружению. */
  private async domainsOf(environmentIds: string[]): Promise<Map<string, string[]>> {
    if (environmentIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .select()
      .from(environmentDomains)
      .where(inArray(environmentDomains.environmentId, environmentIds))
      .orderBy(asc(environmentDomains.name));

    const grouped = new Map<string, string[]>();

    for (const row of rows) {
      grouped.set(row.environmentId, [...(grouped.get(row.environmentId) ?? []), row.name]);
    }

    return grouped;
  }

  /** Заменяет набор доменов окружения целиком. */
  private async replaceDomains(
    tx: Transaction,
    environmentId: string,
    domains: string[],
  ): Promise<void> {
    await tx.delete(environmentDomains).where(eq(environmentDomains.environmentId, environmentId));

    if (domains.length === 0) {
      return;
    }

    await tx
      .insert(environmentDomains)
      .values(domains.map((name) => ({ environmentId, name })));
  }

  /**
   * Находит окружение, принадлежащее указанному проекту.
   *
   * Принадлежность проверяется в самом запросе: окружение из чужого проекта
   * обязано выглядеть несуществующим, а не «чужим» (спека 6).
   */
  private async requireEnvironment(
    executor: Executor,
    projectId: string,
    environmentId: string,
  ): Promise<Environment> {
    const [environment] = await executor
      .select()
      .from(environments)
      .where(and(eq(environments.id, environmentId), eq(environments.projectId, projectId)))
      .limit(1);

    if (!environment) {
      throw new SectionNotVisibleError();
    }

    return environment;
  }
}
