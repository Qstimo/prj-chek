import { z } from 'zod';

import { ProjectLifecycle } from '../enums';
import { platformCreateSchema, platformRefSchema } from './platform';

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

/**
 * Строка сводки проектов: метаданные плюс обзор по уровню секций.
 *
 * Не полный паспорт (его отдаёт detail) и не статус (его отдаёт
 * `/status/summary`). Поля Info/Infra пустеют при отсутствии выдачи
 * так же, как при отсутствии данных — секция не светится.
 */
export const projectListItemSchema = projectMetadataSchema.extend({
  /** Дата паспорта; только при Info ≥ Read. */
  updatedAt: z.string().nullable(),
  /** Платформы паспорта; пустой массив без Info ≥ Metadata. */
  platforms: z.array(platformRefSchema),
  /** Первый домен прод-окружения (name ASC); без Infra ≥ Metadata — null. */
  productionDomain: z.string().nullable(),
  /** Имя машины прода; без Infra ≥ Read — null. */
  productionServerName: z.string().nullable(),
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

/**
 * Поля, доступные для правки при уровне записи.
 *
 * Строгая намеренно: платформы здесь не принимаются, и без `.strict()`
 * присланное поле молча отбросилось бы вместо отказа.
 */
export const projectUpdateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    purpose: z.string().max(2000).nullable().optional(),
    stack: z.string().max(500).nullable().optional(),
    repoUrl: z.string().url().max(500).nullable().optional(),
    ownerUserId: z.string().uuid().nullable().optional(),
    lifecycle: z.nativeEnum(ProjectLifecycle).optional(),
    notes: z.string().max(10_000).nullable().optional(),
  })
  .strict();

/**
 * Поля для создания проекта. Слаг генерируется сервером и здесь не принимается.
 *
 * Платформы принимаются здесь, но не в правке: при создании затирать
 * нечего, а требовать сначала создать проект и лишь потом вернуться
 * за платформами — лишний шаг. В правке каждая платформа действует своей
 * мутацией и чужого не трогает.
 *
 * Строгость наследуется от правки: `.extend()` в zod сохраняет
 * `unknownKeys`, поэтому создание тоже отвергает лишние поля. Так и
 * нужно — переписывать схему отдельным нестрогим `z.object` нельзя,
 * требование выше потеряется.
 */
export const projectCreateSchema = projectUpdateSchema.extend({
  name: z.string().min(1).max(200),
  platforms: z.array(platformCreateSchema).max(20).optional(),
});

/** Проект на уровне метаданных. */
export type ProjectMetadata = z.infer<typeof projectMetadataSchema>;

/** Строка сводки проектов. */
export type ProjectListItem = z.infer<typeof projectListItemSchema>;

/** Проект на уровне чтения. */
export type ProjectDetail = z.infer<typeof projectDetailSchema>;

/** Данные для правки проекта. */
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;

/** Данные для создания проекта. */
export type ProjectCreate = z.infer<typeof projectCreateSchema>;
