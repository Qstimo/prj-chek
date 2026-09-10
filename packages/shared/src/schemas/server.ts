import { z } from 'zod';

import { EnvironmentKind, HealthState, ProjectLifecycle, StatusIndicator } from '../enums';
import { statusWarningSchema } from './status';

/**
 * Предупреждать об оплате сервера за две недели.
 *
 * Порог лежит в контракте, а не рядом с `TLS_WARN_DAYS` в API: то же число
 * нужно плашке срока в интерфейсе, а из веба в `apps/api` импортировать
 * нечего. Два объявления одного порога неизбежно разошлись бы.
 */
export const SERVER_WARN_DAYS = 14;

/**
 * Календарная дата в формате `YYYY-MM-DD`.
 *
 * У срока оплаты нет часа: хранение его отметкой времени породило бы
 * вопрос о часовом поясе при сравнении с «сегодня».
 */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата');

/** Поля для создания сервера. Обязательно только имя — реестр заполняется постепенно. */
export const serverCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  owner: z.string().trim().max(200).nullable().optional(),
  host: z.string().trim().max(253).nullable().optional(),
  ip: z.string().ip().nullable().optional(),
  provider: z.string().trim().max(200).nullable().optional(),
  specs: z.string().trim().max(500).nullable().optional(),
  paidUntil: isoDateSchema.nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
});

/** Поля, доступные для правки. */
export const serverUpdateSchema = serverCreateSchema.partial();

/** Строка реестра: поля сервера, агрегированный статус и счётчики. */
export const serverRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  owner: z.string().nullable(),
  host: z.string().nullable(),
  ip: z.string().nullable(),
  provider: z.string().nullable(),
  specs: z.string().nullable(),
  paidUntil: z.string().nullable(),
  notes: z.string().nullable(),
  indicator: z.nativeEnum(StatusIndicator),
  warnings: z.array(statusWarningSchema),
  /** Различных проектов на сервере, а не окружений: считаем, что упадёт. */
  projectCount: z.number().int().nonnegative(),
  environmentCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Окружение на сервере вместе с проектом, которому оно принадлежит. */
export const serverEnvironmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  kind: z.nativeEnum(EnvironmentKind),
  projectId: z.string().uuid(),
  projectName: z.string(),
  health: z.nativeEnum(HealthState).nullable(),
});

/** Детали сервера: строка реестра плюс что именно на нём живёт. */
export const serverDetailSchema = serverRowSchema.extend({
  environments: z.array(serverEnvironmentSchema),
});

/**
 * Данные карты размещения.
 *
 * Ребро есть, если хотя бы одно окружение проекта привязано к серверу;
 * сами окружения перечислены на ребре подписью. Окружения без сервера
 * в карту не попадают — для них есть список проектов на сводке.
 */
export const serverMapSchema = z.object({
  servers: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      owner: z.string().nullable(),
      indicator: z.nativeEnum(StatusIndicator),
      paidUntil: z.string().nullable(),
      warnings: z.array(statusWarningSchema),
    }),
  ),
  projects: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      lifecycle: z.nativeEnum(ProjectLifecycle),
      indicator: z.nativeEnum(StatusIndicator),
    }),
  ),
  edges: z.array(
    z.object({
      serverId: z.string().uuid(),
      projectId: z.string().uuid(),
      environments: z.array(
        z.object({
          id: z.string().uuid(),
          name: z.string(),
          kind: z.nativeEnum(EnvironmentKind),
        }),
      ),
    }),
  ),
});

/** Данные для создания сервера. */
export type ServerCreate = z.infer<typeof serverCreateSchema>;

/** Данные для правки сервера. */
export type ServerUpdate = z.infer<typeof serverUpdateSchema>;

/** Строка реестра серверов. */
export type ServerRow = z.infer<typeof serverRowSchema>;

/** Окружение на сервере. */
export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

/** Детали сервера. */
export type ServerDetail = z.infer<typeof serverDetailSchema>;

/** Данные карты размещения. */
export type ServerMap = z.infer<typeof serverMapSchema>;
