import { AuditSubjectKind } from '@cairn/shared';
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { projects } from './projects';
import { subjects } from './subjects';

/**
 * Виды действующих лиц в журнале.
 *
 * Отдельное перечисление, расширяющее `subject_kind` значением `system`
 * для действий с консоли сервера. Объединять их нельзя (спека 4.7).
 */
export const auditSubjectKindEnum = pgEnum('audit_subject_kind', [
  AuditSubjectKind.User,
  AuditSubjectKind.AgentToken,
  AuditSubjectKind.IntakeAddress,
  AuditSubjectKind.System,
]);

/**
 * Журнал действий. Только на добавление.
 *
 * Запрет изменения обеспечивается правами роли базы, а не кодом: журнал —
 * средство расследования инцидентов, включая инциденты с участием самого
 * приложения (спека 4.7).
 *
 * `subjectId` пуст для действий с консоли — субъекта у них нет.
 * `subjectKind` и `subjectLabel` денормализованы, чтобы запись оставалась
 * информативной после отзыва субъекта.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'restrict' }),
    subjectKind: auditSubjectKindEnum('subject_kind').notNull(),
    subjectLabel: text('subject_label').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    /**
     * Идентификатор объекта действия — **текст**, а не `uuid`.
     *
     * У почти всех объектов это идентификатор строки, и он `uuid`. У
     * настройки службы модели идентификатором строки **является значение
     * перечня** (`task_suggester`): у таблицы `model_services` первичный
     * ключ — перечень, а не суррогат (дизайн настройки служб, 3.2). Писать
     * сюда что-то другое было бы неправдой, а колонка `uuid` не приняла бы
     * правду, — поэтому расширен тип колонки, а не подменено значение.
     */
    entityId: text('entity_id'),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'restrict' }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_created_at_idx').on(table.createdAt),
    index('audit_log_subject_idx').on(table.subjectId),
    index('audit_log_project_idx').on(table.projectId),
  ],
);

/** Строка журнала. */
export type AuditLogEntry = typeof auditLog.$inferSelect;
