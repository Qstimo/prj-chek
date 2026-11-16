import { z } from 'zod';

/**
 * Окно истории падений по умолчанию, в днях.
 *
 * Падения считаются за окно, а не за всё время: «падал 3 раза» без срока —
 * утверждение, которое с годами перестаёт что-либо значить. Тридцать дней —
 * тот же горизонт, на который смотрит дежурный по инфраструктуре.
 */
export const INCIDENT_WINDOW_DAYS = 30;

/**
 * Предел окна, в днях.
 *
 * Год: дальше история падений перестаёт быть наблюдением и становится
 * архивом, а чистки таблицы в системе нет (дизайн уведомлений, раздел 15).
 */
export const INCIDENT_WINDOW_MAX_DAYS = 365;

/** Страница истории по умолчанию. */
export const INCIDENT_PAGE_LIMIT = 20;

/** Предел страницы истории: защита от выборки таблицы целиком. */
export const INCIDENT_PAGE_MAX_LIMIT = 200;

/**
 * Падение адреса как отрезок времени.
 *
 * Статус отвечает на вопрос «как сейчас», инцидент — «когда и сколько».
 * Пустой `resolvedAt` означает, что адрес не отвечает до сих пор, и он же
 * отвечает на вопрос «лежит с какого момента»: второй колонки для этого
 * не завели намеренно — она разошлась бы с инцидентом.
 */
export const incidentSchema = z.object({
  id: z.string().uuid(),
  domainId: z.string().uuid(),
  startedAt: z.string(),
  /** Пусто — инцидент открыт. */
  resolvedAt: z.string().nullable(),
  /** Причина на момент падения: «HTTP 500», «таймаут». */
  cause: z.string().nullable(),
});

/** Инциденты одного адреса: открытый отдельно от закрытых. */
export const addressIncidentsSchema = z.object({
  domainId: z.string().uuid(),
  name: z.string(),
  open: incidentSchema.nullable(),
  /** Закрытые в окне, свежие первыми. Глубина ограничена сервером. */
  past: z.array(incidentSchema),
  /**
   * Сколько падений было в окне `windowDays`, включая открытое.
   *
   * Отдельным числом, а не длиной `past`: список усечён, и счёт по нему
   * застывал бы на пределе выдачи, выглядя при этом достоверным.
   *
   * Открытое падение входит в счёт: прежнее поле считало только закрытые,
   * и четвёртое падение подряд читалось как «падал 3 раза» — адрес лежит
   * прямо сейчас, а последнее падение в счёт не попало.
   */
  fallsInWindow: z.number().int().nonnegative(),
  /**
   * Окно счёта в днях — то же, за которое отобран `past`.
   *
   * Едет вместе с числом: «падал 3 раза» без окна читается как утверждение
   * за всё время, а считается последний месяц.
   */
  windowDays: z.number().int().positive(),
});

/** Инциденты адресов проекта. */
export const projectIncidentsSchema = z.array(addressIncidentsSchema);

/**
 * Запрос истории одного адреса.
 *
 * Приходит параметрами адреса, поэтому числа приводятся из строк. Схема
 * нестрогая по образцу фильтров журнала: лишний параметр в ссылке — не
 * повод отказать в истории.
 */
export const addressIncidentsQuerySchema = z.object({
  /** Окно в днях; конец окна — «сейчас» на сервере. */
  windowDays: z.coerce
    .number()
    .int()
    .min(1)
    .max(INCIDENT_WINDOW_MAX_DAYS)
    .default(INCIDENT_WINDOW_DAYS),
  limit: z.coerce.number().int().min(1).max(INCIDENT_PAGE_MAX_LIMIT).default(INCIDENT_PAGE_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Окно, за которое посчитана история.
 *
 * Границы считает сервер: «сейчас» на машине человека и на сервере — разные
 * мгновения, и доля времени, посчитанная по одной границе и показанная с
 * другой, не сошлась бы с суммой отрезков.
 */
export const incidentWindowSchema = z.object({
  days: z.number().int().positive(),
  from: z.string(),
  to: z.string(),
});

/**
 * Сводка по адресу за окно: вычисляется, не хранится (инвариант дизайна).
 *
 * `downSeconds` — сумма пересечений отрезков падений с окном, поэтому
 * инцидент, начавшийся до окна, входит в неё частью, а открытый —
 * отрезком до конца окна. `uptime` выводится из неё и длины окна, и
 * второго места хранения доли нет.
 */
export const addressDowntimeSchema = z.object({
  /** Падений, задевших окно, включая открытое. */
  falls: z.number().int().nonnegative(),
  /** Суммарно секунд «не отвечает» внутри окна. */
  downSeconds: z.number().int().nonnegative(),
  /** Доля времени, когда адрес отвечал: 1 — ни одного падения в окне. */
  uptime: z.number().min(0).max(1),
});

/**
 * История падений одного адреса.
 *
 * Открытое падение лежит и в `incidents` (страница — полная история), и
 * отдельным полем `open`: при листании вглубь шапка панели иначе потеряла
 * бы факт «лежит прямо сейчас».
 */
export const addressIncidentHistorySchema = z.object({
  domainId: z.string().uuid(),
  name: z.string(),
  window: incidentWindowSchema,
  summary: addressDowntimeSchema,
  open: incidentSchema.nullable(),
  /** Падения, задевшие окно, свежие первыми. */
  incidents: z.array(incidentSchema),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  /**
   * Смещение следующей страницы; пусто — страница последняя.
   *
   * Обнуляемое, а не необязательное: «страниц больше нет» — это ответ, и
   * от забытого поля он отличаться обязан.
   */
  nextOffset: z.number().int().nonnegative().nullable(),
});

/** Инцидент адреса. */
export type Incident = z.infer<typeof incidentSchema>;

/** Инциденты одного адреса. */
export type AddressIncidents = z.infer<typeof addressIncidentsSchema>;

/** Инциденты адресов проекта. */
export type ProjectIncidents = z.infer<typeof projectIncidentsSchema>;

/** Запрос истории одного адреса. */
export type AddressIncidentsQuery = z.infer<typeof addressIncidentsQuerySchema>;

/** Окно истории. */
export type IncidentWindow = z.infer<typeof incidentWindowSchema>;

/** Сводка простоя адреса за окно. */
export type AddressDowntime = z.infer<typeof addressDowntimeSchema>;

/** История падений одного адреса. */
export type AddressIncidentHistory = z.infer<typeof addressIncidentHistorySchema>;
