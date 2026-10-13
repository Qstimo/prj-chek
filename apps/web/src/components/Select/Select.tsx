'use client';

import { ChevronDownIcon } from '@/assets/icons';

import { CONTROL_CLASSES, WIDTH_CLASSES } from './constants';
import { SelectWidth, type IProps } from './types';

/**
 * Контрол выбора: один вид на все одиннадцать мест приложения.
 *
 * Нативный `<select>`, а не выпадающий список на Radix: тот не слушается
 * `userEvent.selectOptions`, и переход потребовал бы переписать тесты всех
 * мест и завести обходной путь для jsdom. Выигрыш — вид списка, который
 * открыт мгновение; цена — клавиатура и мобильный выбор, которые
 * у нативного уже правильные.
 *
 * Подпись остаётся снаружи: у полей форм она видимая и своя, у клеток
 * матриц её нет вовсе — там подписью служит `label` для читалок.
 */
export function Select({
  value,
  onChange,
  children,
  id,
  label,
  width = SelectWidth.Full,
  isDisabled = false,
}: IProps) {
  return (
    <div className={`relative ${WIDTH_CLASSES[width]}`}>
      <select
        id={id}
        aria-label={label}
        value={value}
        disabled={isDisabled}
        onChange={(event) => onChange(event.target.value)}
        className={`${CONTROL_CLASSES} ${WIDTH_CLASSES[width]}`}
      >
        {children}
      </select>

      <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
