import {
  rootDomainOf,
  type DomainCreate,
  type DomainDetail,
  type DomainMap,
  type DomainRow,
  type DomainUpdate,
} from '@cairn/shared';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';

import { DATABASE } from '../db/db.module';
import type { Database, Transaction } from '../db/db.types';
import {
  domains,
  environmentDomains,
  environments,
  projects,
  type Domain,
} from '../db/schema';
import { domainIndicatorOf, domainRenewalWarningsOf } from '../status/indicator';
import { buildDomainMap, type DomainMapSubdomain } from './domain-map';

/**
 * Доступ к реестру корневых доменов.
 *
 * Субъекта в сигнатуре нет — как и у серверов, и по той же причине: домен
 * межпроектен, выдачи на него не бывает, и проверять здесь нечего. Реестр
 * закрыт правом суперадмина на уровне контроллера (спека этапа 10, раздел 3).
 *
 * Исключение — {@link DomainsRepository.ensureRoot}: его зовёт репозиторий
 * окружений от лица подрядчика. Метод заводит только имя корня и никаких
 * свойств не раскрывает и не меняет.
 */
@Injectable()
export class DomainsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Реестр корней со статусом и счётчиками. */
  async list(): Promise<DomainRow[]> {
    const rows = await this.db.select().from(domains).orderBy(asc(domains.name));
    const subdomains = await this.subdomainsOf(rows.map((row) => row.id));
    const now = new Date();

    return rows.map((row) => this.rowOf(row, subdomains.get(row.id) ?? [], now));
  }

  /** Корень вместе с растущими из него поддоменами. */
  async findById(id: string): Promise<DomainDetail> {
    const root = await this.requireDomain(this.db, id);
    const subdomains = (await this.subdomainsOf([id])).get(id) ?? [];

    return this.rowOf(root, subdomains, new Date());
  }

  /** Данные карты доменов. */
  async map(): Promise<DomainMap> {
    const roots = await this.db.select().from(domains).orderBy(asc(domains.name));
    const subdomains = await this.subdomainsOf(roots.map((root) => root.id));

    return buildDomainMap(
      { domains: roots, subdomains: [...subdomains.values()].flat() },
      new Date(),
    );
  }

  /** Заводит корень вручную. */
  async create(tx: Transaction, input: DomainCreate): Promise<Domain> {
    await this.requireFreeName(tx, input.name);

    const [created] = await tx.insert(domains).values(input).returning();

    return created!;
  }

  /**
   * Возвращает корень имени, заводя его при первом появлении.
   *
   * Свойства существующего корня не трогаются: подрядчик, вписавший
   * поддомен, не должен обнулить владельца и срок, заданные суперадмином.
   */
  async ensureRoot(tx: Transaction, name: string): Promise<Domain> {
    const root = rootDomainOf(name);

    const [existing] = await tx
      .select()
      .from(domains)
      .where(eq(domains.name, root))
      .limit(1);

    if (existing) {
      return existing;
    }

    // `onConflictDoNothing` вместо голой вставки: два одновременных
    // сохранения окружений с поддоменами одного нового корня оба минуют
    // выборку выше, и второй получил бы сырое нарушение ключа — то есть
    // 500 и откат всей правки окружения.
    const [created] = await tx
      .insert(domains)
      .values({ name: root })
      .onConflictDoNothing({ target: domains.name })
      .returning();

    if (created) {
      return created;
    }

    const [raced] = await tx.select().from(domains).where(eq(domains.name, root)).limit(1);

    return raced!;
  }

  /** Меняет свойства корня. */
  async update(tx: Transaction, id: string, input: DomainUpdate): Promise<Domain> {
    await this.requireDomain(tx, id);

    const [updated] = await tx
      .update(domains)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(domains.id, id))
      .returning();

    return updated!;
  }

  /** Удаляет корень. Занятый корень удалить нельзя. */
  async remove(tx: Transaction, id: string): Promise<Domain> {
    const root = await this.requireDomain(tx, id);

    const [occupant] = await tx
      .select({ id: environmentDomains.id })
      .from(environmentDomains)
      .where(eq(environmentDomains.domainId, id))
      .limit(1);

    if (occupant) {
      throw new ConflictException('У домена есть поддомены. Сначала уберите их из окружений.');
    }

    await tx.delete(domains).where(eq(domains.id, id));

    return root;
  }

  /** Собирает строку реестра: статус считается по сроку продления. */
  private rowOf(root: Domain, subdomains: DomainMapSubdomain[], now: Date): DomainRow {
    const warnings = domainRenewalWarningsOf(root.name, root.paidUntil, now);

    return {
      id: root.id,
      name: root.name,
      owner: root.owner,
      registrar: root.registrar,
      paidUntil: root.paidUntil,
      notes: root.notes,
      indicator: domainIndicatorOf(root.name, root.paidUntil, now),
      warnings,
      subdomainCount: subdomains.length,
      projectCount: new Set(subdomains.map((subdomain) => subdomain.projectId)).size,
      subdomains: subdomains.map((subdomain) => ({
        id: subdomain.id,
        name: subdomain.name,
        environmentId: subdomain.environmentId,
        environmentName: subdomain.environmentName,
        environmentKind: subdomain.environmentKind,
        projectId: subdomain.projectId,
        projectName: subdomain.projectName,
      })),
      createdAt: root.createdAt.toISOString(),
      updatedAt: root.updatedAt.toISOString(),
    };
  }

  /** Поддомены корней вместе с окружениями и проектами. */
  private async subdomainsOf(domainIds: string[]): Promise<Map<string, DomainMapSubdomain[]>> {
    const grouped = new Map<string, DomainMapSubdomain[]>();

    if (domainIds.length === 0) {
      return grouped;
    }

    const rows = await this.db
      .select({
        domainId: environmentDomains.domainId,
        id: environmentDomains.id,
        name: environmentDomains.name,
        environmentId: environments.id,
        environmentName: environments.name,
        environmentKind: environments.kind,
        projectId: projects.id,
        projectName: projects.name,
      })
      .from(environmentDomains)
      .innerJoin(environments, eq(environments.id, environmentDomains.environmentId))
      .innerJoin(projects, eq(projects.id, environments.projectId))
      .where(inArray(environmentDomains.domainId, domainIds))
      .orderBy(asc(projects.name), asc(environmentDomains.name));

    for (const row of rows) {
      grouped.set(row.domainId, [...(grouped.get(row.domainId) ?? []), row]);
    }

    return grouped;
  }

  /** Возвращает корень либо сообщает, что его нет. */
  private async requireDomain(executor: Database | Transaction, id: string): Promise<Domain> {
    const [root] = await executor.select().from(domains).where(eq(domains.id, id)).limit(1);

    if (!root) {
      throw new NotFoundException('Домен не найден.');
    }

    return root;
  }

  /**
   * Проверяет, что имя свободно.
   *
   * Ограничение уникальности есть и в базе, но человеку нужен внятный
   * отказ, а не 500 от сырого нарушения ключа.
   */
  private async requireFreeName(tx: Transaction, name: string): Promise<void> {
    const [taken] = await tx
      .select({ id: domains.id })
      .from(domains)
      .where(eq(domains.name, name))
      .limit(1);

    if (taken) {
      throw new ConflictException('Домен с таким именем уже есть в реестре.');
    }
  }
}
