import { WarningTone } from './types';

/** Заголовок блока, когда свой не задан. */
export const DEFAULT_TITLE = 'Предупреждения';

/**
 * Оформление по срочности.
 *
 * Классы записаны целиком, а не собираются из кусков: Tailwind вырезает
 * классы, которых нет в исходниках буквально.
 */
export const TONE_STYLES: Record<WarningTone, string> = {
  [WarningTone.Critical]: 'border-destructive/50 bg-destructive/10',
  [WarningTone.Attention]: 'border-amber-500/50 bg-amber-500/10',
};
