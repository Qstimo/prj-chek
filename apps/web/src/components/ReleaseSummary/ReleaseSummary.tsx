import { SummaryRow } from './SummaryRow';
import type { IProps } from './types';

/**
 * Сводка релизов над диаграммой роадмапа.
 *
 * Презентационный компонент, данные только пропами: тот же экземпляр
 * работает на внутреннем экране (из кэша TanStack Query) и на публичной
 * странице, которая получает роадмап пропом от серверной страницы
 * и TanStack Query не поднимает.
 *
 * Порядок строк не меняется: сервер уже упорядочил их по позиции
 * платформы, и вторая сортировка здесь разошлась бы с ним.
 */
export function ReleaseSummary({ summary }: IProps) {
  if (summary.length === 0) {
    return null;
  }

  return (
    <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-3">
      {summary.map((row) => (
        <SummaryRow key={row.platform.id} row={row} />
      ))}
    </dl>
  );
}
