import { z } from 'zod';

import { RoadmapVersionState } from '../enums';
import { dayDateSchema } from './day-date';
import { platformIdsSchema, platformReleaseSchema, releaseSummaryRowSchema } from './platform';

/** Адрес задачи во внешнем трекере. */
const checkpointUrlSchema = z.string().trim().url().max(2000).nullable();

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
  /**
   * Ссылка на задачу во внешнем трекере.
   *
   * Указатель наружу, а не задача внутри: исполнителей, оценок и дат
   * у чекпоинта по-прежнему нет, и трекером продукт не становится (ТЗ 1.4).
   */
  url: checkpointUrlSchema,
  /**
   * Платформы, на которые едет результат. Необязательно и больше одной.
   *
   * Намеренно без `platformIdsSchema`: это выдача, а не приём, и
   * проверять в ней повторы и лимит незачем.
   */
  platformIds: z.array(z.string().uuid()),
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
  plannedDate: dayDateSchema,
  releasedDate: dayDateSchema,
  position: z.number().int().positive(),
  progress: roadmapProgressSchema,
});

/** Версия на уровне чтения: плюс формулировки чекпоинтов и выпуски. */
export const roadmapVersionDetailSchema = roadmapVersionMetadataSchema.extend({
  checkpoints: z.array(roadmapCheckpointSchema),
  releases: z.array(platformReleaseSchema),
});

/** Стадия проекта: позиция текущей версии в последовательности. */
export const roadmapStageSchema = z.object({
  current: z.number().int().positive().nullable(),
  total: z.number().int().nonnegative(),
});

/** Роадмап проекта в проекции по уровню, со сводкой релизов. */
export const roadmapResponseSchema = z.object({
  stage: roadmapStageSchema,
  versions: z.array(z.union([roadmapVersionDetailSchema, roadmapVersionMetadataSchema])),
  summary: z.array(releaseSummaryRowSchema),
});

/** Создание версии. */
export const roadmapVersionCreateSchema = z
  .object({
    label: z.string().trim().min(1).max(100),
    plannedDate: dayDateSchema.optional(),
    releasedDate: dayDateSchema.optional(),
    state: z.nativeEnum(RoadmapVersionState).optional(),
  })
  .strict();

/** Правка версии, включая позицию в последовательности. */
export const roadmapVersionUpdateSchema = z
  .object({
    label: z.string().trim().min(1).max(100).optional(),
    plannedDate: dayDateSchema.optional(),
    releasedDate: dayDateSchema.optional(),
    state: z.nativeEnum(RoadmapVersionState).optional(),
    position: z.number().int().positive().optional(),
  })
  .strict();

/** Создание чекпоинта: только формулировка. */
export const roadmapCheckpointCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    url: checkpointUrlSchema.optional(),
    /**
     * Набор целиком: он правится целиком в одной форме чекпоинта.
     * Отсутствие поля в правке означает «не трогать», пустой массив —
     * «снять все»; иначе переключение галочки «закрыт» снесло бы теги.
     */
    platformIds: platformIdsSchema.optional(),
  })
  .strict();

/** Правка чекпоинта: формулировка, признак, позиция. */
export const roadmapCheckpointUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    url: checkpointUrlSchema.optional(),
    isDone: z.boolean().optional(),
    position: z.number().int().positive().optional(),
    /** Набор целиком; отсутствие поля не трогает теги. */
    platformIds: platformIdsSchema.optional(),
  })
  .strict();

/** Запрос заголовка по ссылке на задачу. */
export const linkTitleRequestSchema = z
  .object({ url: z.string().trim().url().max(2000) })
  .strict();

/** Ответ: заголовок либо его отсутствие — неудача чтения не ошибка. */
export const linkTitleResponseSchema = z.object({ title: z.string().nullable() });

/** Публичная ссылка роадмапа. */
export const publicLinkSchema = z.object({
  token: z.string(),
  url: z.string(),
});

/**
 * Чекпоинт в публичной выдаче: без ссылки на задачу.
 *
 * Публичная страница роадмапа открыта без авторизации, и ссылка раскрыла бы
 * адрес внутреннего трекера вместе с номером задачи. Отдельная схема, а не
 * проекция по уровню: публичная страница ходит именно под уровнем чтения,
 * и различать пути по уровню значило бы менять его смысл.
 *
 * Схема строгая: лишнее поле — ошибка, а не молчаливое отбрасывание. Тихое
 * отбрасывание скрыло бы ошибку проекции вместо того, чтобы её показать.
 */
export const publicCheckpointSchema = roadmapCheckpointSchema.omit({ url: true }).strict();

/** Версия в публичной выдаче. */
export const publicVersionSchema = roadmapVersionMetadataSchema.extend({
  checkpoints: z.array(publicCheckpointSchema),
  releases: z.array(platformReleaseSchema),
});

/** Публичный роадмап: то же, что видит уровень чтения внутри, без ссылок. */
export const publicRoadmapSchema = z.object({
  projectName: z.string(),
  stage: roadmapStageSchema,
  versions: z.array(publicVersionSchema),
  summary: z.array(releaseSummaryRowSchema),
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

/** Запрос заголовка по ссылке. */
export type LinkTitleRequest = z.infer<typeof linkTitleRequestSchema>;

/** Ответ с заголовком. */
export type LinkTitleResponse = z.infer<typeof linkTitleResponseSchema>;

/** Публичная ссылка. */
export type PublicLink = z.infer<typeof publicLinkSchema>;

/** Чекпоинт в публичной выдаче. */
export type PublicCheckpoint = z.infer<typeof publicCheckpointSchema>;

/** Версия в публичной выдаче. */
export type PublicVersion = z.infer<typeof publicVersionSchema>;

/** Публичный роадмап. */
export type PublicRoadmap = z.infer<typeof publicRoadmapSchema>;
