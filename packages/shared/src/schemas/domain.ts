import { z } from 'zod';

import { EnvironmentKind, StatusIndicator } from '../enums';
import { domainSchema } from './environment';
import { isoDateSchema } from './server';
import { statusWarningSchema } from './status';

/**
 * Предупреждать о продлении домена за месяц.
 *
 * Месяц, а не две недели как у сервера: неоплаченная машина продолжает
 * работать, а освободившийся домен могут перехватить в тот же день.
 */
export const DOMAIN_RENEWAL_WARN_DAYS = 30;

/**
 * Зоны, в которых регистрируемое имя — третьего уровня.
 *
 * Закрытый список вместо Public Suffix List: полный список — внешняя
 * зависимость с ежемесячными обновлениями ради случая, которого в реестре
 * нет. Если корень определён неверно, суперадмин переносит поддомен руками.
 */
export const TWO_LEVEL_SUFFIXES = [
  'co.uk',
  'org.uk',
  'com.ua',
  'com.br',
  'com.au',
  'co.jp',
  'com.tr',
  'co.il',
];

/**
 * Корневой домен — то, за что платят.
 *
 * Две последние метки, кроме зон из {@link TWO_LEVEL_SUFFIXES}: там три.
 * Имя без точки остаётся собой — так ведут себя внутренние адреса вида
 * `localhost`, и отбрасывать их незачем.
 */
export function rootDomainOf(name: string): string {
  const normalized = name.trim().toLowerCase();
  const labels = normalized.split('.');

  if (labels.length < 3) {
    return normalized;
  }

  const lastTwo = labels.slice(-2).join('.');
  const depth = TWO_LEVEL_SUFFIXES.includes(lastTwo) ? 3 : 2;

  return labels.slice(-depth).join('.');
}

/** Поля для создания корневого домена. Обязательно только имя. */
export const domainCreateSchema = z.object({
  name: domainSchema,
  owner: z.string().trim().max(200).nullable().optional(),
  registrar: z.string().trim().max(200).nullable().optional(),
  paidUntil: isoDateSchema.nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
});

/**
 * Поля, доступные для правки.
 *
 * Имя не правится намеренно: за ним висят поддомены, вычисленные из него
 * же. Переименование корня оставило бы их на чужом родителе, а следующий
 * поддомен старой зоны завёл бы вторую запись того же корня — и счётчики
 * с предупреждениями разошлись бы у обеих.
 */
export const domainUpdateSchema = domainCreateSchema.omit({ name: true }).partial();

/** Строка реестра доменов: поля корня, статус и счётчики. */
export const domainRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  owner: z.string().nullable(),
  registrar: z.string().nullable(),
  paidUntil: z.string().nullable(),
  notes: z.string().nullable(),
  indicator: z.nativeEnum(StatusIndicator),
  warnings: z.array(statusWarningSchema),
  subdomainCount: z.number().int().nonnegative(),
  /** Различных проектов на корне: считаем, кого затронет непродление. */
  projectCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Поддомен: домен окружения вместе с его проектом. */
export const domainSubdomainSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  environmentId: z.string().uuid(),
  environmentName: z.string(),
  environmentKind: z.nativeEnum(EnvironmentKind),
  projectId: z.string().uuid(),
  projectName: z.string(),
});

/** Детали корня: строка реестра плюс что из него растёт. */
export const domainDetailSchema = domainRowSchema.extend({
  subdomains: z.array(domainSubdomainSchema),
});

/**
 * Данные карты доменов.
 *
 * Ребро есть, если хотя бы один поддомен корня принадлежит окружению
 * проекта; сами поддомены перечислены на ребре подписью.
 */
export const domainMapSchema = z.object({
  domains: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      owner: z.string().nullable(),
      indicator: z.nativeEnum(StatusIndicator),
      paidUntil: z.string().nullable(),
      warnings: z.array(statusWarningSchema),
    }),
  ),
  projects: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      indicator: z.nativeEnum(StatusIndicator),
    }),
  ),
  edges: z.array(
    z.object({
      domainId: z.string().uuid(),
      projectId: z.string().uuid(),
      subdomains: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
    }),
  ),
});

/** Данные для создания корневого домена. */
export type DomainCreate = z.infer<typeof domainCreateSchema>;

/** Данные для правки корневого домена. */
export type DomainUpdate = z.infer<typeof domainUpdateSchema>;

/** Строка реестра доменов. */
export type DomainRow = z.infer<typeof domainRowSchema>;

/** Поддомен корня. */
export type DomainSubdomain = z.infer<typeof domainSubdomainSchema>;

/** Детали корневого домена. */
export type DomainDetail = z.infer<typeof domainDetailSchema>;

/** Данные карты доменов. */
export type DomainMap = z.infer<typeof domainMapSchema>;
