import { z } from 'zod';

import { HealthState, StatusCheckCode, StatusIndicator, StatusWarningKind } from '../enums';
import { DAY_PATTERN, NO_SUCH_DAY, isCalendarDay } from './day-date';

/**
 * Статус окружения: вывод из статусов его адресов, а не измерение.
 *
 * Задержка и причина отказа принадлежат адресу — у окружения их столько
 * же, сколько адресов. Здесь остаётся ответ на один вопрос: жив ли стенд
 * целиком. `null` означает, что не проверялся ни один его адрес.
 */
export const environmentStatusSchema = z.object({
  environmentId: z.string().uuid(),
  name: z.string(),
  health: z.nativeEnum(HealthState).nullable(),
  checkedAt: z.string().nullable(),
});

/**
 * Статус адреса: все три проверки в одной строке.
 *
 * Пока здоровье лежало у окружения, а сроки — у адреса, они могли
 * описывать разные хосты. Ключ теперь один, и расходиться нечему.
 */
export const domainStatusSchema = z.object({
  domainId: z.string().uuid(),
  /** Окружение, которому адрес принадлежит: по нему статусы группируются. */
  environmentId: z.string().uuid(),
  name: z.string(),
  health: z.nativeEnum(HealthState).nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  healthError: z.string().nullable(),
  /**
   * Что именно увидела проверка доступности.
   *
   * Рядом с фразой, а не вместо неё: фраза — для человека, код — для
   * расшифровки. `null` означает чистый `2xx`: сказать о нём нечего.
   * Код бывает и у живого адреса — «закрыто авторизацией» не падение.
   */
  healthCode: z.nativeEnum(StatusCheckCode).nullable(),
  /**
   * Куда ведёт перенаправление, если проверка его получила.
   *
   * 302 на чужое имя — рабочая настройка у одних и угнанная запись у
   * других, и разобрать это можно, только увидев цель.
   */
  redirectTo: z.string().nullable(),
  /**
   * Адрес, в который разрешилось имя. По нему находится машина.
   *
   * Первый из {@link domainStatusSchema.shape.resolvedIps} по возрастанию:
   * привязка к машине одна, и выбирать её надо так, чтобы выбор не менялся
   * от прогона к прогону. Только адрес, без имени машины: статус открыт
   * уровню «метаданные», а имя сервера принадлежит уровню «чтение» и живёт
   * в карточке окружения.
   */
  resolvedIp: z.string().nullable(),
  /**
   * Все адреса записи, упорядоченные.
   *
   * Резолверы ротируют порядок ответа: пока бралась первая запись, адрес
   * плясал от прогона к прогону, а предупреждение о расхождении мигало
   * вместе с ним. Множество же позволяет сказать правду: имя за CDN
   * смотрит на край сети, а не на машину.
   */
  resolvedIps: z.array(z.string()),
  resolveError: z.string().nullable(),
  tlsValidTo: z.string().nullable(),
  /**
   * Приняла ли система сертификат.
   *
   * Отдельно от срока: пока в строке лежал один `valid_to`, зелёное
   * «TLS до 2027-03-01» уживалось с красным «не отвечает» — `fetch`
   * отвергал сертификат, которому проверка TLS верила, потому что
   * коннектилась с `rejectUnauthorized: false`. `null` означает, что
   * рукопожатия не было и судить не о чем.
   */
  tlsTrusted: z.boolean().nullable(),
  /** Чем именно сертификат не угодил либо почему рукопожатие не вышло. */
  tlsCode: z.nativeEnum(StatusCheckCode).nullable(),
  tlsError: z.string().nullable(),
  registryExpiresAt: z.string().nullable(),
  registryError: z.string().nullable(),
  checkedAt: z.string().nullable(),
});

/**
 * Предупреждение: что и почему требует внимания.
 *
 * Рядом с готовой русской фразой — структурные поля: `kind` доезжал до
 * веба и выбрасывался, а расшифровать «что это значит и что делать»
 * по склеенному тексту нельзя.
 *
 * Структурные поля необязательны, а не обнуляемы: у расхождения привязки
 * нет ни срока, ни порога, ни кода, и заставлять такой вид писать четыре
 * пустоты значило бы засорить всех четырёх производителей предупреждений.
 */
export const statusWarningSchema = z.object({
  kind: z.nativeEnum(StatusWarningKind),
  /** О чём предупреждение: имя окружения или домена. */
  subject: z.string(),
  detail: z.string(),
  /** Что именно увидела проверка: по коду веб раскрывает причину. */
  code: z.nativeEnum(StatusCheckCode).optional(),
  /**
   * Полных суток до срока; отрицательное — просрочка.
   *
   * Считается от начала сегодняшних суток по UTC до начала суток срока —
   * одной договорённостью для сертификата, домена и оплаты машины.
   */
  days: z.number().int().optional(),
  /** С какого запаса в сутках начинают предупреждать. */
  threshold: z.number().int().positive().optional(),
  /** День срока в форме `ГГГГ-ММ-ДД` по UTC — тот же, что в `days`. */
  date: z
    .string()
    .regex(DAY_PATTERN, 'Ожидается дата ГГГГ-ММ-ДД')
    .refine(isCalendarDay, NO_SUCH_DAY)
    .optional(),
});

/** Агрегированный статус проекта (спека 5). */
export const projectStatusSchema = z.object({
  indicator: z.nativeEnum(StatusIndicator),
  environments: z.array(environmentStatusSchema),
  domains: z.array(domainStatusSchema),
  warnings: z.array(statusWarningSchema),
  /**
   * Предупреждения реестров: сроки оплаты машин, сроки продления корней,
   * расхождение привязки.
   *
   * Отдельным списком, а не вместе с остальными, потому что отвечать на
   * них проекту нечем: межпроектную машину и корневой домен правит один
   * суперадмин. Они не красят индикатор проекта — красный, на который
   * нельзя ответить действием, обесценивает красный, на который можно, —
   * и не-суперадмину приходят пустыми: имя машины принадлежит реестру,
   * а статус открыт уровню «метаданные».
   */
  registryWarnings: z.array(statusWarningSchema),
});

/** Строка сводки статусов по видимым проектам. */
export const statusSummaryRowSchema = z.object({
  projectId: z.string().uuid(),
  projectName: z.string(),
  indicator: z.nativeEnum(StatusIndicator),
  warnings: z.array(statusWarningSchema),
});

/** Статус окружения. */
export type EnvironmentStatus = z.infer<typeof environmentStatusSchema>;

/** Статус адреса. */
export type DomainStatus = z.infer<typeof domainStatusSchema>;

/** Предупреждение. */
export type StatusWarning = z.infer<typeof statusWarningSchema>;

/** Агрегированный статус проекта. */
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

/** Строка сводки статусов. */
export type StatusSummaryRow = z.infer<typeof statusSummaryRowSchema>;
