import { z } from 'zod';

import { ChronicleSource } from '../enums';

/** Дата события: день без времени. Точное время хранит `createdAt`. */
const occurredOnSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата ГГГГ-ММ-ДД');

/** Запись хроники на уровне метаданных: дата, заголовок, источник (ТЗ 4.3). */
export const chronicleMetadataSchema = z.object({
  id: z.string().uuid(),
  occurredOn: occurredOnSchema,
  title: z.string(),
  source: z.nativeEnum(ChronicleSource),
});

/** Запись на уровне чтения: плюс содержимое и служебные поля. */
export const chronicleDetailSchema = chronicleMetadataSchema.extend({
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Поля для создания записи вручную. */
export const chronicleEntryCreateSchema = z.object({
  occurredOn: occurredOnSchema,
  title: z.string().trim().min(1).max(300),
  content: z.string().trim().min(1).max(65_536),
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
