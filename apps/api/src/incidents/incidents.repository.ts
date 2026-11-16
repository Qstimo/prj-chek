import {
  AccessLevel,
  INCIDENT_WINDOW_DAYS,
  Section,
  type AddressIncidentHistory,
  type AddressIncidentsQuery,
  type Incident,
  type IncidentWindow,
  type ProjectIncidents,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import { SectionNotVisibleError } from '../access/access.errors';
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

/** Сутки в миллисекундах: окно задаётся днями, а границы — мгновениями. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Хранилище инцидентов адресов (дизайн уведомлений, раздел 3).
 *
 * Запись без субъекта: инциденты заводит прогон, а не человек. Чтение —
 * с проверкой прав: история падений принадлежит уровню «метаданные»
 * секции «Инфраструктура», как и сам статус (ТЗ 4.3).
 *
 * Момент «сейчас» методы чтения принимают последним аргументом и по
 * умолчанию берут системный: окно и доля времени считаются от одной
 * границы, и в тестах эта граница обязана быть зафиксирована — иначе
 * проверка доли простоя зависела бы от дня прогона.
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

  /** Инциденты адресов проекта за окно по умолчанию. Право — метаданные. */
  async forProject(
    subject: RequestSubject,
    projectId: string,
    now: Date = new Date(),
  ): Promise<ProjectIncidents> {
    await this.access.requireLevel(
      subject,
      projectId,
      Section.Infrastructure,
      AccessLevel.Metadata,
    );

    const window = windowOf(INCIDENT_WINDOW_DAYS, now);
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
          .where(and(touchesWindow(address.id, window), isNotNull(addressIncidents.resolvedAt)))
          .orderBy(desc(addressIncidents.startedAt))
          .limit(PAST_INCIDENTS_LIMIT);

        // Считаются все падения окна, включая открытое: счёт только по
        // закрытым читался как «падал 3 раза» в тот момент, когда адрес
        // лежал четвёртый раз.
        const [counted] = await this.db
          .select({ total: count() })
          .from(addressIncidents)
          .where(touchesWindow(address.id, window));

        return {
          domainId: address.id,
          name: address.name,
          open: open ? viewOf(open) : null,
          past: past.map(viewOf),
          fallsInWindow: counted?.total ?? 0,
          windowDays: window.days,
        };
      }),
    );
  }

  /**
   * История падений одного адреса: сводка за окно и страница инцидентов.
   *
   * Отдельная ручка, а не выборка из выдачи по проекту: панель разбора
   * открывается на один адрес, и тянуть историю всех адресов проекта,
   * чтобы показать один, значит платить тремя запросами на каждый
   * чужой адрес (дизайн, раздел 5).
   *
   * Доля времени вычисляется, не хранится: сумма пересечений отрезков
   * падений с окном считается в базе одним запросом — вторая копия этого
   * счёта (например, колонка «аптайм») разошлась бы с отрезками.
   */
  async forAddress(
    subject: RequestSubject,
    projectId: string,
    domainId: string,
    query: AddressIncidentsQuery,
    now: Date = new Date(),
  ): Promise<AddressIncidentHistory> {
    await this.access.requireLevel(
      subject,
      projectId,
      Section.Infrastructure,
      AccessLevel.Metadata,
    );

    const address = await this.requireAddress(projectId, domainId);
    const window = windowOf(query.windowDays, now);
    const touching = touchesWindow(domainId, window);

    // Границы окна отдельными выражениями: в сумму они входят трижды, и
    // расхождение между вхождениями дало бы долю, не сходящуюся с
    // отрезками.
    const to = sql`${window.to}::timestamptz`;
    const from = sql`${window.from}::timestamptz`;
    // Пересечение отрезка с окном: открытое падение считается до конца
    // окна (`coalesce`), начавшееся раньше — только частью внутри окна
    // (`greatest`). Отрицательных слагаемых быть не может, но
    // `greatest(0, …)` оставлен на случай строки, где закрытие записано
    // раньше начала.
    const downSecondsExpr = sql<string>`coalesce(sum(greatest(0, extract(epoch from (
      least(coalesce(${addressIncidents.resolvedAt}, ${to}), ${to})
      - greatest(${addressIncidents.startedAt}, ${from})
    )))), 0)`;

    const [totals] = await this.db
      .select({ falls: count(), downSeconds: downSecondsExpr })
      .from(addressIncidents)
      .where(touching);

    const page = await this.db
      .select()
      .from(addressIncidents)
      .where(touching)
      .orderBy(desc(addressIncidents.startedAt))
      .limit(query.limit)
      .offset(query.offset);

    const [open] = await this.db
      .select()
      .from(addressIncidents)
      .where(and(eq(addressIncidents.domainId, domainId), isNull(addressIncidents.resolvedAt)))
      .limit(1);

    const falls = totals?.falls ?? 0;
    const downSeconds = Math.round(Number(totals?.downSeconds ?? 0));
    const windowSeconds = (window.days * DAY_MS) / 1000;

    return {
      domainId,
      name: address.name,
      window,
      summary: {
        falls,
        downSeconds,
        // Доля округляется до шести знаков: доли процента здесь уже не
        // смысл, а шум двоичной дроби.
        uptime: round(Math.min(1, Math.max(0, 1 - downSeconds / windowSeconds))),
      },
      open: open ? viewOf(open) : null,
      incidents: page.map(viewOf),
      offset: query.offset,
      limit: query.limit,
      nextOffset: query.offset + page.length < falls ? query.offset + page.length : null,
    };
  }

  /**
   * Адрес обязан принадлежать проекту из ссылки.
   *
   * Чужой адрес выглядит несуществующим — тем же `404`, что и отсутствие
   * выдачи: иначе ответ подтвердил бы, что адрес есть (ТЗ 4.2).
   */
  private async requireAddress(
    projectId: string,
    domainId: string,
  ): Promise<{ id: string; name: string }> {
    const [address] = await this.db
      .select({ id: environmentDomains.id, name: environmentDomains.name })
      .from(environmentDomains)
      .innerJoin(environments, eq(environments.id, environmentDomains.environmentId))
      .where(and(eq(environmentDomains.id, domainId), eq(environments.projectId, projectId)))
      .limit(1);

    if (!address) {
      throw new SectionNotVisibleError();
    }

    return address;
  }
}

/** Окно: конец — «сейчас» на сервере, начало — на столько суток раньше. */
function windowOf(days: number, now: Date): IncidentWindow {
  return {
    days,
    from: new Date(now.getTime() - days * DAY_MS).toISOString(),
    to: now.toISOString(),
  };
}

/**
 * Падения адреса, задевшие окно хотя бы частью.
 *
 * Отбор по пересечению, а не по началу: инцидент, начавшийся до окна и
 * длящийся внутри него, — это простой окна, и выпасть из счёта он не
 * может. Открытый задевает окно всегда.
 */
function touchesWindow(domainId: string, window: IncidentWindow): SQL {
  return and(
    eq(addressIncidents.domainId, domainId),
    lte(addressIncidents.startedAt, new Date(window.to)),
    or(
      isNull(addressIncidents.resolvedAt),
      gte(addressIncidents.resolvedAt, new Date(window.from)),
    ),
  )!;
}

/** Шесть знаков после запятой: дальше начинается шум двоичной дроби. */
function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
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
