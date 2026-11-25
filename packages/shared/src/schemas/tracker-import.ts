import { z } from 'zod';

export const trackerPersonSchema = z.object({ id: z.string().min(1), name: z.string() });
export const trackerTaskDetailsSchema = z.object({
  projectId: z.string(),
  assignees: z.array(trackerPersonSchema),
  author: trackerPersonSchema.nullable(),
  createdAt: z.string().nullable(),
  startAt: z.string().nullable(),
  dueAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export type TrackerTaskDetails = z.infer<typeof trackerTaskDetailsSchema>;

export const trackerImportQuerySchema = z
  .object({
    boardId: z.string().trim().min(1).max(100),
    columnId: z.string().max(100).optional(),
    status: z.enum(['all', 'open', 'completed']).default('open'),
    assigneeId: z.string().max(100).optional(),
    search: z.string().trim().max(200).optional(),
    dateField: z.enum(['createdAt', 'startAt', 'dueAt', 'completedAt']).default('dueAt'),
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
  })
  .strict()
  .refine((query) => !query.dateFrom || !query.dateTo || query.dateFrom <= query.dateTo, {
    message: 'Начало периода должно быть не позже конца.',
    path: ['dateTo'],
  });
export type TrackerImportQuery = z.infer<typeof trackerImportQuerySchema>;

export const trackerImportCandidateSchema = z.object({
  externalId: z.string(),
  title: z.string(),
  externalUrl: z.string(),
  boardId: z.string(),
  boardColumnId: z.string().nullable(),
  isCompleted: z.boolean(),
  details: trackerTaskDetailsSchema,
  existingTaskId: z.string().uuid().nullable(),
  blockedReason: z.string().nullable(),
});
export type TrackerImportCandidate = z.infer<typeof trackerImportCandidateSchema>;
export const trackerImportPreviewSchema = z.object({
  tasks: z.array(trackerImportCandidateSchema),
  people: z.array(trackerPersonSchema),
  peopleAvailable: z.boolean(),
  truncated: z.boolean(),
});
export type TrackerImportPreview = z.infer<typeof trackerImportPreviewSchema>;

export const trackerImportRequestSchema = z
  .object({
    boardId: z.string().trim().min(1).max(100),
    /** Нет поля — ближайший разрабатываемый релиз; null — вне релиза. */
    versionId: z.string().uuid().nullable().optional(),
    externalIds: z
      .array(z.string().regex(/^[1-9]\d*$/))
      .min(1)
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length, 'Задачи не должны повторяться.'),
  })
  .strict();
export type TrackerImportRequest = z.infer<typeof trackerImportRequestSchema>;
export const trackerImportResultSchema = z.object({
  externalId: z.string(),
  taskId: z.string().uuid().nullable(),
  outcome: z.enum(['created', 'existing', 'skipped']),
  reason: z.string().nullable(),
});
export type TrackerImportResult = z.infer<typeof trackerImportResultSchema>;
