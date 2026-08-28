import { z } from 'zod';

import { HealthState, StatusIndicator, StatusWarningKind } from '../enums';

/** Статус окружения. Null-поля означают «ещё не проверялось». */
export const environmentStatusSchema = z.object({
  environmentId: z.string().uuid(),
  name: z.string(),
  health: z.nativeEnum(HealthState).nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  error: z.string().nullable(),
  checkedAt: z.string().nullable(),
});

/** Статус домена: сроки TLS и регистрации либо ошибки их получения. */
export const domainStatusSchema = z.object({
  domainId: z.string().uuid(),
  name: z.string(),
  tlsValidTo: z.string().nullable(),
  tlsError: z.string().nullable(),
  registryExpiresAt: z.string().nullable(),
  registryError: z.string().nullable(),
  checkedAt: z.string().nullable(),
});

/** Предупреждение: что и почему требует внимания. */
export const statusWarningSchema = z.object({
  kind: z.nativeEnum(StatusWarningKind),
  /** О чём предупреждение: имя окружения или домена. */
  subject: z.string(),
  detail: z.string(),
});

/** Агрегированный статус проекта (спека 5). */
export const projectStatusSchema = z.object({
  indicator: z.nativeEnum(StatusIndicator),
  environments: z.array(environmentStatusSchema),
  domains: z.array(domainStatusSchema),
  warnings: z.array(statusWarningSchema),
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

/** Статус домена. */
export type DomainStatus = z.infer<typeof domainStatusSchema>;

/** Предупреждение. */
export type StatusWarning = z.infer<typeof statusWarningSchema>;

/** Агрегированный статус проекта. */
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

/** Строка сводки статусов. */
export type StatusSummaryRow = z.infer<typeof statusSummaryRowSchema>;
