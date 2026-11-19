/** Ключи колонок сводки. */
export type ProjectColumnKey =
  | 'name'
  | 'tags'
  | 'lifecycle'
  | 'platforms'
  | 'domain'
  | 'server'
  | 'indicator'
  | 'updatedAt';

/** Колонка сводки: подпись шапки и класс, общий у шапки и клетки. */
export interface ProjectColumn {
  key: ProjectColumnKey;
  label: string;
  className: string;
}

/**
 * Колонки сводки с долями ширины.
 *
 * Доли, а не `min-width` у таблицы: прежние 64rem не влезали в контейнер
 * на 61rem, и сводка ехала вправо на любом экране, даже на большом. При
 * `table-fixed` доли задаются один раз — шапкой, — поэтому ширины и
 * видимость живут здесь, а не повторяются в строке и в заголовке.
 *
 * Сумма — 100%: при переполнении браузер уменьшает все колонки пропорционально,
 * и тесной становится каждая, а не та, что в конце.
 *
 * Платформы и сервер скрыты на узких экранах: оба значения всё равно
 * обрезаются и оба повторяются внутри проекта, а название со статусом —
 * нет. Прокрутки боком не остаётся ни на какой ширине.
 */
export const PROJECT_COLUMNS: ProjectColumn[] = [
  { key: 'name', label: 'Название', className: 'w-[17%]' },
  { key: 'tags', label: 'Теги', className: 'w-[14%]' },
  { key: 'lifecycle', label: 'Состояние', className: 'w-[11%]' },
  { key: 'platforms', label: 'Платформы', className: 'hidden w-[10%] lg:table-cell' },
  { key: 'domain', label: 'Домен', className: 'w-[15%]' },
  { key: 'server', label: 'Сервер', className: 'hidden w-[9%] lg:table-cell' },
  { key: 'indicator', label: 'Статус', className: 'w-[13%]' },
  { key: 'updatedAt', label: 'Обновлён', className: 'hidden w-[11%] sm:table-cell' },
];

/** Класс колонки по ключу: строка не повторяет ширины шапки. */
export const PROJECT_COLUMN_CLASS = Object.fromEntries(
  PROJECT_COLUMNS.map((column) => [column.key, column.className]),
) as Record<ProjectColumnKey, string>;
