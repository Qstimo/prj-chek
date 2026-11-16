import type { StatusWarning } from '@cairn/shared';

import { formatDate, pluralize } from '@/utils';

/**
 * Срок предупреждения словами: день, остаток и порог.
 *
 * Собирается из структурных полей, а не разбирается из фразы: поля
 * необязательны, и у расхождения привязки их нет вовсе — тогда строки
 * срока не появляется, а не появляется пустая.
 *
 * Все три поля считает сервер одной договорённостью (полные сутки по UTC),
 * поэтому здесь не считается ничего — только складывается текст.
 */
export function deadlineTextOf(warning: StatusWarning): string | null {
  const { days, threshold, date } = warning;

  if (days === undefined && date === undefined) {
    return null;
  }

  const day = date ? formatDate(date) : null;
  const left = days === undefined ? null : leftTextOf(days);
  const guard = threshold === undefined ? null : `предупреждаем за ${threshold}`;
  const tail = [left, guard].filter((part) => part !== null).join(', ');

  if (!day) {
    return tail === '' ? null : tail;
  }

  return tail === '' ? day : `${day} — ${tail}`;
}

/** Остаток суток до срока; отрицательный — просрочка. */
function leftTextOf(days: number): string {
  if (days === 0) {
    return 'сегодня';
  }

  return days > 0
    ? `через ${pluralize(days, 'день', 'дня', 'дней')}`
    : `прошёл ${pluralize(-days, 'день', 'дня', 'дней')} назад`;
}
