import { date, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/**
 * Серверы реестра (ТЗ 3.2).
 *
 * Межпроектная сущность: на одной машине живут окружения разных проектов,
 * и именно поэтому сервер не принадлежит проекту и не выдаётся по секциям.
 * Доступ к нему закрыт правом суперадмина, как к пользователям и журналу.
 *
 * Обязательно только имя: реестр заполняется постепенно, и запись,
 * заведённая за минуту до совещания, полезнее отсутствующей.
 */
export const servers = pgTable(
  'servers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** На кого оформлен аккаунт у провайдера и кто платит. */
    owner: text('owner'),
    host: text('host'),
    ip: text('ip'),
    provider: text('provider'),
    specs: text('specs'),
    /**
     * Оплачен до, включительно. Календарная дата, а не отметка времени:
     * у срока нет часа, и зона ему не нужна.
     */
    paidUntil: date('paid_until'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('servers_name').on(table.name),
    // Поиск машины по разрешённому адресу идёт на каждом прогоне проверок.
    // Индекс, а не уникальность: NAT, переезды и две записи об одной
    // машине — обычная жизнь реестра.
    index('servers_ip_idx').on(table.ip),
  ],
);

/** Строка таблицы серверов. */
export type Server = typeof servers.$inferSelect;
