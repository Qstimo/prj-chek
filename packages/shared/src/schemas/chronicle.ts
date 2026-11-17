import { z } from 'zod';

import { ChronicleSource } from '../enums';
import { requiredDaySchema } from './day-date';
import { HAS_NUL, isNulFree } from './plain-text';

/** Запись хроники на уровне метаданных: дата, заголовок, источник (ТЗ 4.3). */
export const chronicleMetadataSchema = z.object({
  id: z.string().uuid(),
  occurredOn: requiredDaySchema,
  title: z.string(),
  source: z.nativeEnum(ChronicleSource),
});

/** Запись на уровне чтения: плюс содержимое и служебные поля. */
export const chronicleDetailSchema = chronicleMetadataSchema.extend({
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * Поля для создания записи вручную.
 *
 * Нулевой байт отвергается: текстовая колонка его не принимает, и без
 * проверки запрос падал бы ошибкой драйвера — `500` вместо отказа с
 * объяснением. Прочие управляющие символы хроника принимает: сужать её до
 * печатных значило бы решать за человека, что он написал.
 */
export const chronicleEntryCreateSchema = z.object({
  occurredOn: requiredDaySchema,
  title: z.string().trim().min(1).max(300).refine(isNulFree, HAS_NUL),
  content: z.string().trim().min(1).max(65_536).refine(isNulFree, HAS_NUL),
});

/** Поля для правки. Источник не правится: он описывает происхождение. */
export const chronicleEntryUpdateSchema = chronicleEntryCreateSchema.partial();

/** Запись на уровне метаданных. */
export type ChronicleMetadata = z.infer<typeof chronicleMetadataSchema>;

/** Запись на уровне чтения. */
export type ChronicleDetail = z.infer<typeof chronicleDetailSchema>;

/** Данные создания записи. */
export type ChronicleEntryCreate = z.infer<typeof chronicleEntryCreateSchema>;

/** Данные правки записи. */
export type ChronicleEntryUpdate = z.infer<typeof chronicleEntryUpdateSchema>;
