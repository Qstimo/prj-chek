import { z } from 'zod';

import { ProjectLifecycle } from '../enums';

/**
 * Проект на уровне метаданных: видно, что он есть, и его состояние (ТЗ 4.3).
 *
 * Спека 5.5 называет здесь «название и состояние»; идентификатор и слаг
 * добавлены как техническая необходимость — без них на проект нельзя
 * сослаться и его карточку нельзя открыть. Содержательных сведений
 * они не раскрывают.
 */
export const projectMetadataSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  lifecycle: z.nativeEnum(ProjectLifecycle),
});

/** Проект на уровне чтения: все поля паспорта. */
export const projectDetailSchema = projectMetadataSchema.extend({
  purpose: z.string().nullable(),
  stack: z.string().nullable(),
  repoUrl: z.string().nullable(),
  ownerUserId: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Поля, доступные для правки при уровне записи. */
export const projectUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  purpose: z.string().max(2000).nullable().optional(),
  stack: z.string().max(500).nullable().optional(),
  repoUrl: z.string().url().max(500).nullable().optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  lifecycle: z.nativeEnum(ProjectLifecycle).optional(),
  notes: z.string().max(10_000).nullable().optional(),
});

/** Поля для создания проекта. Слаг генерируется сервером и здесь не принимается. */
export const projectCreateSchema = projectUpdateSchema.extend({
  name: z.string().min(1).max(200),
});

/** Проект на уровне метаданных. */
export type ProjectMetadata = z.infer<typeof projectMetadataSchema>;

/** Проект на уровне чтения. */
export type ProjectDetail = z.infer<typeof projectDetailSchema>;

/** Данные для правки проекта. */
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;

/** Данные для создания проекта. */
export type ProjectCreate = z.infer<typeof projectCreateSchema>;
