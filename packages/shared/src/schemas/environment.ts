import { z } from 'zod';

import { EnvironmentKind } from '../enums';

/**
 * Домен окружения.
 *
 * Приводится к нижнему регистру и обрезается по краям до проверки:
 * `Example.COM ` и `example.com` — один и тот же адрес, и хранить их
 * как разные записи значило бы дважды проверять один сертификат (этап 6).
 */
export const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, 'Ожидается домен');

/** Окружение на уровне метаданных: видно, что оно есть, и его публичный адрес. */
export const environmentMetadataSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  kind: z.nativeEnum(EnvironmentKind),
  domains: z.array(z.string()),
});

/**
 * Машина, на которой живёт окружение.
 *
 * Вложенный объект, а не поля окружения: у машины они одни, и хранение их
 * в каждом окружении неизбежно разошлось бы. Список проектов сервера сюда
 * не входит — иначе подрядчик увидел бы соседей по машине.
 */
export const environmentServerSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  owner: z.string().nullable(),
  host: z.string().nullable(),
  ip: z.string().nullable(),
  provider: z.string().nullable(),
  specs: z.string().nullable(),
});

/** Окружение на уровне чтения: адрес, машина и заметки. */
export const environmentDetailSchema = environmentMetadataSchema.extend({
  /**
   * Собственный адрес окружения. Перекрывает адрес машины: окружение может
   * жить на поддомене или нестандартном порту, а машина при этом одна.
   */
  host: z.string().nullable(),
  healthCheckUrl: z.string().nullable(),
  notes: z.string().nullable(),
  server: environmentServerSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Поля, доступные для правки при уровне записи. */
export const environmentUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  kind: z.nativeEnum(EnvironmentKind).optional(),
  host: z.string().trim().max(253).nullable().optional(),
  /** Привязку к серверу задаёт суперадмин: список машин межпроектен. */
  serverId: z.string().uuid().nullable().optional(),
  healthCheckUrl: z.string().url().max(500).nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
  domains: z
    .array(domainSchema)
    .max(20)
    .refine((domains) => new Set(domains).size === domains.length, 'Домены повторяются')
    .optional(),
});

/** Поля для создания окружения. Имя и вид обязательны, остальное дополняется позже. */
export const environmentCreateSchema = environmentUpdateSchema.extend({
  name: z.string().trim().min(1).max(100),
  kind: z.nativeEnum(EnvironmentKind),
});

/** Окружение на уровне метаданных. */
export type EnvironmentMetadata = z.infer<typeof environmentMetadataSchema>;

/** Окружение на уровне чтения. */
export type EnvironmentDetail = z.infer<typeof environmentDetailSchema>;

/** Машина, на которой живёт окружение. */
export type EnvironmentServer = z.infer<typeof environmentServerSchema>;

/** Данные для правки окружения. */
export type EnvironmentUpdate = z.infer<typeof environmentUpdateSchema>;

/** Данные для создания окружения. */
export type EnvironmentCreate = z.infer<typeof environmentCreateSchema>;
