import { z } from 'zod';

import { ChronicleSource } from '../enums';
import { requiredDaySchema } from './day-date';
import { HAS_NUL, isNulFree } from './plain-text';

/**
 * Предел длины содержимого записи хроники, в знаках.
 *
 * Прежние 65 536 **отменены**: это полчаса созвона по-русски, а запись
 * хроники — это и есть текст саммари, то есть расшифровка созвона целиком.
 * Человек получал `400` на том, для чего поток и сделан, и предел,
 * отвергающий обычную работу, — не предел, а дефект.
 *
 * Новое число выведено из предела **службы распознавания**: она берёт
 * запись длиной до четырёх часов, а четыре часа речи — это порядка
 * четверти миллиона знаков. 256 Ки знаков покрывают самый длинный созвон,
 * который вообще может доехать до текста, и ни одного знака сверх того:
 * предел остаётся пределом, потому что `text` в PostgreSQL согласился бы и
 * на мегабайты, а разбирать мегабайты чужого тела — наша память.
 *
 * Предел разборщика тела запроса стоит **выше** этого числа
 * (`apps/api/src/common/body-parsers.ts`): иначе длинный текст получал бы
 * неназванное `request entity too large` вместо `400` с полем и причиной.
 */
export const MAX_CHRONICLE_CONTENT_CHARS = 262_144;

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
  content: z
    .string()
    .trim()
    .min(1)
    .max(MAX_CHRONICLE_CONTENT_CHARS)
    .refine(isNulFree, HAS_NUL),
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
