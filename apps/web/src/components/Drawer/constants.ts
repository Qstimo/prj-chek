import { DrawerWidth } from './types';

/**
 * Классы ширины записаны целиком: Tailwind вырезает классы, которых нет
 * в исходниках буквально, и собранный из кусков `max-w-[…]` не пережил бы
 * сборку.
 */
export const WIDTH_CLASSES: Record<DrawerWidth, string> = {
  [DrawerWidth.Default]: 'max-w-[480px]',
  [DrawerWidth.Wide]: 'max-w-[640px]',
  // Ограничение только с `md`, и не меньше узкой панели: на телефоне
  // половина экрана — это половина телефона, а на планшете 50vw меньше
  // нынешних 480px.
  [DrawerWidth.Half]: 'md:max-w-[max(480px,50vw)]',
};
