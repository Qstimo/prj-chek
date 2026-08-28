import { StatusIndicator } from '@cairn/shared';

/** Подписи индикатора: слово обязательно — цвет не единственный носитель. */
export const INDICATOR_LABELS: Record<StatusIndicator, string> = {
  [StatusIndicator.Ok]: 'В порядке',
  [StatusIndicator.Warning]: 'Предупреждение',
  [StatusIndicator.Down]: 'Авария',
  [StatusIndicator.Unknown]: 'Не проверялось',
  [StatusIndicator.Paused]: 'Приостановлен',
};

/** Цвета точки индикатора. */
export const INDICATOR_COLORS: Record<StatusIndicator, string> = {
  [StatusIndicator.Ok]: 'bg-green-500',
  [StatusIndicator.Warning]: 'bg-amber-500',
  [StatusIndicator.Down]: 'bg-red-500',
  [StatusIndicator.Unknown]: 'bg-gray-400',
  [StatusIndicator.Paused]: 'bg-slate-400',
};
