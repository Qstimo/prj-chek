import { SelectWidth } from './types';

/**
 * Классы ширины записаны целиком: Tailwind вырезает классы, которых нет
 * в исходниках буквально.
 */
export const WIDTH_CLASSES: Record<SelectWidth, string> = {
  [SelectWidth.Full]: 'w-full',
  [SelectWidth.Auto]: 'w-auto',
};

/**
 * Общий вид контрола.
 *
 * `appearance-none` убирает системную стрелку — вместо неё своя, иначе
 * в тёмной теме остаётся светлый системный треугольник. `pr-9` оставляет
 * ей место, чтобы длинное значение не уехало под иконку.
 */
export const CONTROL_CLASSES =
  'h-9 appearance-none rounded-md border border-border bg-surface px-3 pr-9 text-sm transition focus:border-border-strong disabled:opacity-50';
