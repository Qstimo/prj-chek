import { z } from 'zod';

/** Страница на уровне метаданных: «список страниц» из ТЗ 4.3. */
export const docPageMetadataSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  updatedAt: z.string(),
});

/** Страница на уровне чтения: плюс содержимое. */
export const docPageDetailSchema = docPageMetadataSchema.extend({
  content: z.string(),
  createdAt: z.string(),
});

/** Создание страницы. Содержимое — Markdown-текст как есть. */
export const docPageCreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  content: z.string().min(1).max(200_000),
});

/** Правка страницы. */
export const docPageUpdateSchema = docPageCreateSchema.partial();

/** Страница на уровне метаданных. */
export type DocPageMetadata = z.infer<typeof docPageMetadataSchema>;

/** Страница на уровне чтения. */
export type DocPageDetail = z.infer<typeof docPageDetailSchema>;

/** Данные создания страницы. */
export type DocPageCreate = z.infer<typeof docPageCreateSchema>;

/** Данные правки страницы. */
export type DocPageUpdate = z.infer<typeof docPageUpdateSchema>;
