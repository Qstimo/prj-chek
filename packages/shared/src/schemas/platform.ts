import { z } from 'zod';

import { PlatformKind, PlatformReleaseState } from '../enums';
import { dayDateSchema } from './day-date';

/**
 * Имя платформы: своё в каждом проекте («Веб-админка», «RuStore»).
 *
 * Регистр не нормализуется: уникальность `(project_id, name)`
 * регистрозависима, и «API» с «api» пройдут обеими записями. Имя — то,
 * что человек видит в сводке, и приводить его к нижнему регистру значило
 * бы показывать «app store».
 */
const platformNameSchema = z.string().trim().min(1).max(100);

/**
 * Платформа проекта: канал поставки.
 *
 * Не окружение и не реестр: у окружения есть машина, адреса и переменные,
 * у магазина их нет вовсе, а платформа и окружение ортогональны — веб
 * бывает на проде и на стейдже, iOS в сторе и в TestFlight. Поэтому
 * платформа живёт в паспорте проекта, а окружение лишь отмечает, какие
 * платформы в нём развёрнуты.
 */
export const platformSchema = z.object({
  id: z.string().uuid(),
  kind: z.nativeEnum(PlatformKind),
  name: z.string(),
  /** Порядок строк сводки. Хранится: из имён он не выводим. */
  position: z.number().int().positive(),
});

/** Ссылка на платформу: окружение и теги чекпоинта порядка не знают. */
export const platformRefSchema = platformSchema.omit({ position: true });

/** Заведение платформы. */
export const platformCreateSchema = z
  .object({ kind: z.nativeEnum(PlatformKind), name: platformNameSchema })
  .strict();

/**
 * Правка платформы: только имя.
 *
 * Вида здесь нет намеренно. Он несёт два инварианта — «у магазина бывает
 * модерация» и «в окружении живёт только наше», — и оба проверяются при
 * записи выпуска и при привязке к окружению. Смена вида прошла бы мимо
 * обеих проверок и оставила бы «на модерации» у нашей машины либо стор
 * в окружении. Сменить вид — удалить платформу и завести заново.
 *
 * Позиции нет по той же причине, по которой переупорядочивание вне
 * объёма: без перенумерации соседей две платформы встали бы на одно
 * место, и порядок сводки стал бы недетерминированным.
 */
export const platformUpdateSchema = z.object({ name: platformNameSchema }).strict();

/**
 * Набор платформ: без повторов, правится целиком.
 *
 * Один на всех, кто его принимает, — теги чекпоинта и платформы
 * окружения: два почти одинаковых определения разошлись бы ограничениями.
 * Отсутствие поля и пустой массив различаются по смыслу: поля нет — набор
 * не трогать, пустой — снять все.
 */
export const platformIdsSchema = z
  .array(z.string().uuid())
  .max(20)
  .refine((ids) => new Set(ids).size === ids.length, 'Платформы повторяются');

/** Выпуск версии на платформе. */
export const platformReleaseSchema = z.object({
  platformId: z.string().uuid(),
  state: z.nativeEnum(PlatformReleaseState),
  releasedDate: dayDateSchema,
  /**
   * Своё обозначение сборки, когда оно отличается от обозначения версии:
   * iOS нумерует сборки («1.2.3 (45)»), веб — нет. Пусто означает
   * «как у версии», а не «неизвестно».
   */
  buildLabel: z.string().nullable(),
});

/** Постановка выпуска: состояние обязательно, остальное дополняется позже. */
export const platformReleaseSetSchema = z
  .object({
    state: z.nativeEnum(PlatformReleaseState),
    releasedDate: dayDateSchema.optional(),
    buildLabel: z.string().trim().max(100).nullable().optional(),
  })
  .strict();

/**
 * Выпуск в сводке: на какую версию он ссылается.
 *
 * `date` у того, что в пути, пуста: даты выхода у отправленного на
 * модерацию ещё нет.
 */
export const releaseRefSchema = z.object({
  versionId: z.string().uuid(),
  versionLabel: z.string(),
  buildLabel: z.string().nullable(),
  date: dayDateSchema,
});

/** Выпуск в пути: то же плюс состояние. */
export const releasePendingSchema = releaseRefSchema.extend({
  state: z.nativeEnum(PlatformReleaseState),
});

/**
 * Строка сводки: что у платформы в релизе и что идёт за ним.
 *
 * Сводка смотрит вперёд от текущего релиза: отклонённая полгода назад
 * версия, которую уже обогнали, в ней не висит.
 *
 * `platform` — полная схема, а не ссылка: экрану нужен `kind` (скрыть
 * модерацию у серверной платформы), а панели версии — весь список
 * платформ проекта, и сводка оказывается единственным местом, откуда
 * роадмап его берёт, не обращаясь к «Инфо».
 */
export const releaseSummaryRowSchema = z.object({
  platform: platformSchema,
  released: releaseRefSchema.nullable(),
  pending: z.array(releasePendingSchema),
});

/**
 * Состояния, допустимые у платформы этого вида.
 *
 * Один источник и для выбора в интерфейсе, и для проверки на сервере:
 * два списка разошлись бы, и в базе появилась бы запись о модерации
 * нашего собственного API.
 */
export function releaseStatesFor(kind: PlatformKind): PlatformReleaseState[] {
  if (kind === PlatformKind.Store) {
    return [
      PlatformReleaseState.OnTest,
      PlatformReleaseState.InReview,
      PlatformReleaseState.Released,
      PlatformReleaseState.Rejected,
    ];
  }

  return [PlatformReleaseState.OnTest, PlatformReleaseState.Released];
}

/** Платформа проекта. */
export type Platform = z.infer<typeof platformSchema>;

/** Ссылка на платформу. */
export type PlatformRef = z.infer<typeof platformRefSchema>;

/** Заведение платформы. */
export type PlatformCreate = z.infer<typeof platformCreateSchema>;

/** Правка платформы. */
export type PlatformUpdate = z.infer<typeof platformUpdateSchema>;

/** Выпуск версии на платформе. */
export type PlatformRelease = z.infer<typeof platformReleaseSchema>;

/** Постановка выпуска. */
export type PlatformReleaseSet = z.infer<typeof platformReleaseSetSchema>;

/** Выпуск в сводке. */
export type ReleaseRef = z.infer<typeof releaseRefSchema>;

/** Выпуск в пути. */
export type ReleasePending = z.infer<typeof releasePendingSchema>;

/** Строка сводки релизов. */
export type ReleaseSummaryRow = z.infer<typeof releaseSummaryRowSchema>;
