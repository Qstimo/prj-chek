import { PlatformKind, type PlatformCreate } from '@cairn/shared';

/**
 * Пресеты платформ: подсказки, а не каталог.
 *
 * Полупрозрачные чипы предлагают частое, но вид и имя остаются
 * свободными: магазинов больше, чем влезет в список, и новый появится
 * без правки кода.
 */
export const PLATFORM_PRESETS: PlatformCreate[] = [
  { kind: PlatformKind.Server, name: 'API' },
  { kind: PlatformKind.Server, name: 'Веб' },
  { kind: PlatformKind.Store, name: 'App Store' },
  { kind: PlatformKind.Store, name: 'Google Play' },
  { kind: PlatformKind.Store, name: 'RuStore' },
];

/** Подписи видов платформы. */
export const PLATFORM_KIND_LABELS: Record<PlatformKind, string> = {
  [PlatformKind.Server]: 'На наших машинах',
  [PlatformKind.Store]: 'Магазин',
  [PlatformKind.Other]: 'Другое',
};
