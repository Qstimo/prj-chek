import { AccessLevel, Section, type Incident, type ProjectIncidents } from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';

import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import {
  addressIncidents,
  environmentDomains,
  environments,
  type AddressIncidentRow,
} from '../db/schema';
import { PAST_INCIDENTS_LIMIT } from './constants';

/**
 * Хранилище инцидентов адресов (дизайн уведомлений, раздел 3).
 *
 * Запись без субъекта: инциденты заводит прогон, а не человек. Чтение —
 * с проверкой прав: история падений принадлежит уровню «метаданные»
 * секции «Инфраструктура», как и сам статус (ТЗ 4.3).
 */
@Injectable()
export class IncidentsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly access: AccessService,
  ) {}

  /** Открывает инцидент адреса. Второй открытый запретит индекс базы. */
  async open(domainId: string, cause: string | null): Promise<AddressIncidentRow> {
    const [incident] = await this.db
      .insert(addressIncidents)
      .values({ domainId, cause })
      .returning();

    return incident!;
  }

  /** Закрывает открытый инцидент адреса; пусто — закрывать было нечего. */
  async resolve(domainId: string, at: Date): Promise<AddressIncidentRow | null> {
    const [incident] = await this.db
      .update(addressIncidents)
      .set({ resolvedAt: at })
      .where(and(eq(addressIncidents.domainId, domainId), isNull(addressIncidents.resolvedAt)))
      .returning();

    return incident ?? null;
  }

  /** Открытые инциденты всех адресов картой: ключ — адрес. */
  async openByDomain(): Promise<Map<string, AddressIncidentRow>> {
    const rows = await this.db
      .select()
      .from(addressIncidents)
      .where(isNull(addressIncidents.resolvedAt));

    return new Map(rows.map((row) => [row.domainId, row]));
  }

  /** Инциденты адресов проекта. Право — метаданные инфраструктуры. */
  async forProject(subject: RequestSubject, projectId: string): Promise<ProjectIncidents> {
    await this.access.requireLevel(
      subject,
      projectId,
      Section.Infrastructure,
      AccessLevel.Metadata,
    );

    const addresses = await this.db
      .select({ id: environmentDomains.id, name: environmentDomains.name })
      .from(environmentDomains)
      .innerJoin(environments, eq(environments.id, environmentDomains.environmentId))
      .where(eq(environments.projectId, projectId))
      .orderBy(asc(environmentDomains.name));

    // Запрос на адрес, а не один общий: предел обязан применяться в
    // запросе. Таблица намеренно не чистится, и выбирать её целиком,
    // чтобы отдать двадцать строк, со временем станет дорого. Десятки
    // адресов — тот масштаб, где простота важнее числа запросов.
    return Promise.all(
      addresses.map(async (address) => {
        const [open] = await this.db
          .select()
          .from(addressIncidents)
          .where(
            and(eq(addressIncidents.domainId, address.id), isNull(addressIncidents.resolvedAt)),
          )
          .limit(1);

        const past = await this.db
          .select()
          .from(addressIncidents)
          .where(
            and(eq(addressIncidents.domainId, address.id), isNotNull(addressIncidents.resolvedAt)),
          )
          .orderBy(desc(addressIncidents.startedAt))
          .limit(PAST_INCIDENTS_LIMIT);

        return {
          domainId: address.id,
          name: address.name,
          open: open ? viewOf(open) : null,
          past: past.map(viewOf),
        };
      }),
    );
  }
}

/** Проекция строки в контракт: наружу уходят только строки времени. */
function viewOf(row: AddressIncidentRow): Incident {
  return {
    id: row.id,
    domainId: row.domainId,
    startedAt: row.startedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    cause: row.cause,
  };
}
