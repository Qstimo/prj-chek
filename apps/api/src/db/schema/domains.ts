import { date, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/**
 * Корневые домены реестра (ТЗ 3.2).
 *
 * Единица оплаты: продлевают `example.com`, а не `stage.example.com`.
 * Как и сервер, домен межпроектен — поддомены одного корня расходятся
 * по окружениям разных проектов, — и потому не принадлежит проекту
 * и не выдаётся по секциям.
 *
 * Корень заводится автоматически, когда подрядчик вписывает домен
 * окружения: адрес стенда — рабочая мелочь, ради которой нельзя дёргать
 * владельца реестра. Свойства корня заполняет суперадмин позже, поэтому
 * обязательно только имя.
 */
export const domains = pgTable(
  'domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** На кого оформлен домен и кто платит. */
    owner: text('owner'),
    registrar: text('registrar'),
    /** Оплачен до, включительно. Календарная дата: у срока нет часа. */
    paidUntil: date('paid_until'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('domains_name').on(table.name)],
);

/** Строка таблицы корневых доменов. */
export type Domain = typeof domains.$inferSelect;
