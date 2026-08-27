import { z } from 'zod';

import { AuditSubjectKind } from '../enums.js';

/** Фильтры журнала (спека 9.1). */
export const auditQuerySchema = z.object({
  subjectId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  action: z.string().max(100).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Запись журнала. */
export const auditEntrySchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid().nullable(),
  subjectKind: z.nativeEnum(AuditSubjectKind),
  subjectLabel: z.string(),
  action: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().uuid().nullable(),
  projectId: z.string().uuid().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: z.string(),
});

/** Страница журнала. */
export const auditPageSchema = z.object({
  entries: z.array(auditEntrySchema),
  total: z.number().int(),
});

/** Фильтры журнала. */
export type AuditQuery = z.infer<typeof auditQuerySchema>;

/** Запись журнала. */
export type AuditEntry = z.infer<typeof auditEntrySchema>;

/** Страница журнала. */
export type AuditPage = z.infer<typeof auditPageSchema>;
