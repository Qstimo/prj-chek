import { PlatformReleaseState } from '@cairn/shared';

/** Подписи состояний выпуска. */
export const RELEASE_STATE_LABELS: Record<PlatformReleaseState, string> = {
  [PlatformReleaseState.OnTest]: 'на тесте',
  [PlatformReleaseState.InReview]: 'на модерации',
  [PlatformReleaseState.Released]: 'в релизе',
  [PlatformReleaseState.Rejected]: 'отклонена',
};

/**
 * Классы плашек по состоянию. Записаны целиком: Tailwind вырезает классы,
 * которых нет в исходниках буквально.
 *
 * Палитра та же, что у точек статуса: зелёный — вышло, жёлтый — ждёт,
 * красный — встало. Токенов `ok` и `warning` в теме нет, и заводить их
 * ради плашек — отдельная работа.
 *
 * Контрасты текста на подложке `/15` поверх фона темы: amber 7.1:1,
 * green 6.8:1, muted 6.5:1 — все проходят AA. Красный — исключение:
 * `-500` даёт 4.45:1 и не проходит для мелкого текста, поэтому здесь
 * `-400` (6.1:1). Точка статуса рядом остаётся `-500` осознанно: у неё
 * нет текста поверх, и требование к контрасту другое.
 */
export const RELEASE_STATE_CLASSES: Record<PlatformReleaseState, string> = {
  [PlatformReleaseState.OnTest]: 'bg-muted text-muted-foreground',
  [PlatformReleaseState.InReview]: 'bg-amber-500/15 text-amber-500',
  [PlatformReleaseState.Released]: 'bg-green-500/15 text-green-500',
  [PlatformReleaseState.Rejected]: 'bg-red-500/15 text-red-400',
};

/** Подпись строки без ни одного выпущенного выпуска. */
export const NO_RELEASES = 'Релизов ещё не было';
