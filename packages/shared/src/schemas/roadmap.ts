import { z } from 'zod';

import { RoadmapVersionState } from '../enums';

/** Плановая дата: день без времени. */
const plannedDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата ГГГГ-ММ-ДД')
  .nullable();

/**
 * Чекпоинт: формулировка результата и признак «закрыт» — и ничего больше.
 *
 * Исполнителей, оценок, дат, комментариев и вложенности не будет:
 * это сознательное ограничение ТЗ 1.4, удерживающее продукт от трекера.
 * Схемы строгие: лишние поля — ошибка, а не молчаливое отбрасывание.
 */
export const roadmapCheckpointSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  isDone: z.boolean(),
  position: z.number().int().positive(),
});

/** Прогресс версии: вычисляется, не хранится (ТЗ 3.5). */
export const roadmapProgressSchema = z.object({
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

/** Версия на уровне метаданных: паспорт и прогресс, без формулировок. */
export const roadmapVersionMetadataSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  state: z.nativeEnum(RoadmapVersionState),
  plannedDate: plannedDateSchema,
  position: z.number().int().positive(),
  progress: roadmapProgressSchema,
});

/** Версия на уровне чтения: плюс формулировки чекпоинтов. */
export const roadmapVersionDetailSchema = roadmapVersionMetadataSchema.extend({
  checkpoints: z.array(roadmapCheckpointSchema),
});

/** Стадия проекта: позиция текущей версии в последовательности. */
export const roadmapStageSchema = z.object({
  current: z.number().int().positive().nullable(),
  total: z.number().int().nonnegative(),
});

/** Роадмап проекта в проекции по уровню. */
export const roadmapResponseSchema = z.object({
  stage: roadmapStageSchema,
  versions: z.array(z.union([roadmapVersionDetailSchema, roadmapVersionMetadataSchema])),
});

/** Создание версии. */
export const roadmapVersionCreateSchema = z
  .object({
    label: z.string().trim().min(1).max(100),
    plannedDate: plannedDateSchema.optional(),
    state: z.nativeEnum(RoadmapVersionState).optional(),
  })
  .strict();

/** Правка версии, включая позицию в последовательности. */
export const roadmapVersionUpdateSchema = z
  .object({
    label: z.string().trim().min(1).max(100).optional(),
    plannedDate: plannedDateSchema.optional(),
    state: z.nativeEnum(RoadmapVersionState).optional(),
    position: z.number().int().positive().optional(),
  })
  .strict();

/** Создание чекпоинта: только формулировка. */
export const roadmapCheckpointCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
  })
  .strict();

/** Правка чекпоинта: формулировка, признак, позиция. */
export const roadmapCheckpointUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    isDone: z.boolean().optional(),
    position: z.number().int().positive().optional(),
  })
  .strict();

/** Публичная ссылка роадмапа. */
export const publicLinkSchema = z.object({
  token: z.string(),
  url: z.string(),
});

/** Публичный роадмап: то же, что видит уровень чтения внутри. */
export const publicRoadmapSchema = z.object({
  projectName: z.string(),
  stage: roadmapStageSchema,
  versions: z.array(roadmapVersionDetailSchema),
});

/** Чекпоинт. */
export type RoadmapCheckpoint = z.infer<typeof roadmapCheckpointSchema>;

/** Прогресс версии. */
export type RoadmapProgress = z.infer<typeof roadmapProgressSchema>;

/** Версия на уровне метаданных. */
export type RoadmapVersionMetadata = z.infer<typeof roadmapVersionMetadataSchema>;

/** Версия на уровне чтения. */
export type RoadmapVersionDetail = z.infer<typeof roadmapVersionDetailSchema>;

/** Стадия проекта. */
export type RoadmapStage = z.infer<typeof roadmapStageSchema>;

/** Роадмап проекта. */
export type RoadmapResponse = z.infer<typeof roadmapResponseSchema>;

/** Создание версии. */
export type RoadmapVersionCreate = z.infer<typeof roadmapVersionCreateSchema>;

/** Правка версии. */
export type RoadmapVersionUpdate = z.infer<typeof roadmapVersionUpdateSchema>;

/** Создание чекпоинта. */
export type RoadmapCheckpointCreate = z.infer<typeof roadmapCheckpointCreateSchema>;

/** Правка чекпоинта. */
export type RoadmapCheckpointUpdate = z.infer<typeof roadmapCheckpointUpdateSchema>;

/** Публичная ссылка. */
export type PublicLink = z.infer<typeof publicLinkSchema>;

/** Публичный роадмап. */
export type PublicRoadmap = z.infer<typeof publicRoadmapSchema>;
