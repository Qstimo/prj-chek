import { ACTION_LABELS, SUBJECT_KIND_LABELS } from './constants';
import type { IProps } from './types';

/**
 * Журнал действий (ТЗ 4.4).
 *
 * Только чтение: изменить записи нельзя ни отсюда, ни из кода — роль базы
 * не имеет таких прав (спека 4.7).
 */
export function AuditTable({ entries }: IProps) {
  if (entries.length === 0) {
    return <p className="text-muted-foreground">По выбранным условиям нет записей.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className="border-b border-border p-2 text-left">Когда</th>
            <th scope="col" className="border-b border-border p-2 text-left">Кто</th>
            <th scope="col" className="border-b border-border p-2 text-left">Тип</th>
            <th scope="col" className="border-b border-border p-2 text-left">Действие</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="border-b border-border [tr:last-child_&]:border-b-0 p-2 whitespace-nowrap">
                {formatMoment(entry.createdAt)}
              </td>
              <td className="border-b border-border [tr:last-child_&]:border-b-0 p-2">{entry.subjectLabel}</td>
              <td className="border-b border-border [tr:last-child_&]:border-b-0 p-2">
                {SUBJECT_KIND_LABELS[entry.subjectKind]}
              </td>
              <td className="border-b border-border [tr:last-child_&]:border-b-0 p-2">
                {ACTION_LABELS[entry.action] ?? entry.action}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Форматирует момент по российской локали. */
function formatMoment(value: string): string {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
