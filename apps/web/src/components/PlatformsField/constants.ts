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

/** Имя диалога подтверждения удаления платформы. */
export const REMOVE_CONFIRM_LABEL = 'Подтверждение удаления платформы';

/**
 * Последствия удаления платформы.
 *
 * Названы прямо: вместе с платформой исчезают строки выпусков во всех
 * версиях, а это единственное место, где у проекта с платформами живут
 * фактические даты релизов. Число унесённых выпусков остаётся в журнале —
 * в выдачу платформ оно не добавлено, иначе его пришлось бы считать при
 * каждом чтении платформ.
 */
export const REMOVE_CONFIRM_HINT =
  'Вместе с платформой исчезнут её выпуски во всех версиях и теги чекпоинтов.';

/** Подписи видов платформы. */
export const PLATFORM_KIND_LABELS: Record<PlatformKind, string> = {
  [PlatformKind.Server]: 'На наших машинах',
  [PlatformKind.Store]: 'Магазин',
  [PlatformKind.Other]: 'Другое',
};
