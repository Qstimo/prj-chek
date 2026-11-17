import { ModelAuthScheme, ModelServiceKind, ModelServicePlacement } from '@cairn/shared';
import { sql } from 'drizzle-orm';
import { boolean, check, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { subjects } from './subjects';

/** Узел настройки. Значения совпадают с контрактом. */
export const modelServiceKindEnum = pgEnum('model_service_kind', [ModelServiceKind.TaskSuggester]);

/** Как ключ предъявляется службе. Значения совпадают с контрактом. */
export const modelAuthSchemeEnum = pgEnum('model_auth_scheme', [
  ModelAuthScheme.Bearer,
  ModelAuthScheme.ApiKey,
  ModelAuthScheme.None,
]);

/** Где стоит узел. Значения совпадают с контрактом. */
export const modelServicePlacementEnum = pgEnum('model_service_placement', [
  ModelServicePlacement.External,
  ModelServicePlacement.Local,
]);

/**
 * Настройка службы модели: адрес, ключ, модель, схема авторизации
 * (дизайн, раздел 3).
 *
 * **`kind` первичным ключом** — расхождение с соглашением репозитория,
 * где везде `uuid pk default gen_random_uuid()`, и оно названо вместе с
 * причиной. Строка здесь не сущность, а настройка: её не создают и не
 * удаляют по одной, у неё нет имени, по ней не ходят ссылки, и таких
 * строк ровно столько, сколько значений в перечне. Перечень ключом даёт
 * три вещи бесплатно: «одна настройка на узел» становится инвариантом
 * базы, запись превращается в один `ON CONFLICT (kind) DO UPDATE` без
 * гонки между двумя вкладками администратора, а адрес ручки читается как
 * `/model-services/task_suggester` — по смыслу, а не по `uuid`, который
 * суперадмину пришлось бы сначала узнать списком (дизайн, 3.2).
 *
 * Версий значения нет намеренно: старый ключ API — это **отозванный**
 * ключ, и механизм отката, возвращающий заведомо негодное, не механизм
 * (дизайн, 3.3). История смен живёт в журнале.
 */
export const modelServices = pgTable(
  'model_services',
  {
    kind: modelServiceKindEnum('kind').primaryKey(),
    /**
     * Адрес одной строкой, а не «узел» плюс «путь».
     *
     * Человек копирует его из документации провайдера; разобрать адрес на
     * части значит заставить его разбирать, а потом собрать обратно ровно
     * так же. Имя узла выводится из адреса, а не хранится: вторая копия
     * разошлась бы при правке.
     */
    baseUrl: text('base_url').notNull(),
    authScheme: modelAuthSchemeEnum('auth_scheme').notNull(),
    /**
     * Ключ под `CryptoService`, формат `v1:nonce:ct:tag`.
     *
     * Обнуляем, и `null` означает ровно «ключа нет». Не пустая строка:
     * пустая строка в шифрованной колонке — это шифротекст пустого
     * значения, то есть «ключ задан и он пустой», и различать их пришлось
     * бы расшифровкой. `null` отвечает на вопрос «задан ли ключ» без
     * ключа шифрования вообще.
     */
    secretEncrypted: text('secret_encrypted'),
    /** Не обнуляем: служба без имени модели не вызывается. */
    model: text('model').notNull(),
    /**
     * Каталог Yandex. Шифрования не получает намеренно: каталог —
     * идентификатор учётной записи, который провайдер пишет в адресной
     * строке своей консоли, а не удостоверение.
     */
    folder: text('folder'),
    /** Знает только человек: по адресу «свой узел или чужой» не определяется. */
    placement: modelServicePlacementEnum('placement').notNull(),
    timeoutSeconds: integer('timeout_seconds').notNull().default(60),
    /**
     * Решение человека «включено», отдельно от полноты настройки.
     *
     * Нужен, чтобы выключить узел, не стирая настройку: провайдер лежит,
     * платить не хотим, ключ терять не хотим. Действующая включённость —
     * конъюнкция этого поля и полноты (дизайн, 3.1).
     */
    isEnabled: boolean('is_enabled').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** «Кто и когда» прямо на экране, а не поиском по журналу. */
    updatedBySubjectId: uuid('updated_by_subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
  },
  (table) => [
    check('model_services_timeout_positive', sql`${table.timeoutSeconds} > 0`),
  ],
);

/** Строка настройки службы модели. Ключ здесь шифрованный. */
export type ModelServiceRow = typeof modelServices.$inferSelect;
