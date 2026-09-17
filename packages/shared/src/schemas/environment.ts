import { z } from 'zod';

import { EnvironmentKind } from '../enums';

/**
 * Имя хоста из того, что вписал человек.
 *
 * Вставить адрес из адресной строки браузера — первое, что делают, и
 * отвечать на это «Ожидается домен» значит требовать ручной правки
 * очевидного. Хранится при этом именно имя: по нему ходят проверки
 * сертификата и срока продления, и путь с портом для них бессмысленны.
 *
 * Непохожее на адрес возвращается как есть: объяснять отказ — дело
 * проверки, а не нормализации.
 */
export function hostnameOf(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const withoutScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  const host = withoutScheme.split(/[/?#]/)[0] ?? '';
  // Учётные данные перед именем и порт после него — не часть имени.
  const withoutUserinfo = host.slice(host.lastIndexOf('@') + 1);

  return withoutUserinfo.replace(/:\d+$/, '').replace(/\.$/, '');
}

/**
 * Домен окружения.
 *
 * Нормализуется до проверки: `Example.COM `, `example.com` и
 * `https://example.com/` — один и тот же адрес, и хранить их как разные
 * записи значило бы дважды проверять один сертификат (этап 6).
 *
 * Последняя метка обязана начинаться с буквы, и это не придирка к форме:
 * иначе доменом пройдёт IP-адрес, корнем ему встанет последняя пара чисел
 * («113.10»), и в реестре корней заведётся запись, которую некому
 * продлевать и нечем проверять.
 */
export const domainSchema = z.preprocess(
  (value) => (typeof value === 'string' ? hostnameOf(value) : value),
  z
    .string()
    .max(253)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, 'Ожидается домен')
    .regex(/\.[a-z][a-z0-9-]*$/, 'Ожидается домен, а не адрес числами'),
);

/**
 * Окружение на уровне метаданных: видно, что оно есть, и его публичный адрес.
 *
 * Адрес окружения — это его домены, отдельного поля адреса нет. Пока полей
 * было два, они расходились по смыслу: домены попадали в реестр корней и под
 * проверки сертификата и срока продления, а «адрес окружения» не попадал
 * никуда — и вписанный туда стенд система не видела.
 */
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

/** Окружение на уровне чтения: машина, проверка и заметки. */
export const environmentDetailSchema = environmentMetadataSchema.extend({
  healthCheckPath: z.string().nullable(),
  notes: z.string().nullable(),
  server: environmentServerSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Поля, доступные для правки при уровне записи. */
export const environmentUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  kind: z.nativeEnum(EnvironmentKind).optional(),
  /** Привязку к серверу задаёт суперадмин: список машин межпроектен. */
  serverId: z.string().uuid().nullable().optional(),
  /**
   * Путь ручки проверки, а не адрес: адресами служат домены окружения.
   *
   * Форма проверяется намеренно строго. Стоит разрешить сюда полный
   * адрес — и появится второе место, где он живёт, то самое, из-за
   * которого здоровье расходилось с проверками сертификата.
   */
  healthCheckPath: z
    .string()
    .trim()
    .max(200)
    .regex(/^\/[^\s?#]*$/, 'Путь начинается со слеша, без адреса и строки запроса')
    .nullable()
    .optional(),
  notes: z.string().max(10_000).nullable().optional(),
  domains: z
    .array(domainSchema)
    .max(20)
    .refine((domains) => new Set(domains).size === domains.length, 'Домены повторяются')
    .optional(),
});

/**
 * Один адрес окружения: только имя, всё остальное выводится.
 *
 * Отдельная схема от `domains` в правке окружения: адрес заводится и
 * снимается по одному, и присылать ради этого весь набор значило бы
 * затирать чужую правку, сделанную между чтением и отправкой.
 */
export const environmentDomainCreateSchema = z.object({ name: domainSchema }).strict();

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

/** Данные для заведения одного адреса. */
export type EnvironmentDomainCreate = z.infer<typeof environmentDomainCreateSchema>;
