/** Отступ полотна карты от краёв. */
export const PADDING = 60;

/** Шаг между узлами по вертикали. */
export const NODE_STEP_Y = 120;

/** Колонки карты: владельцы слева, потребители справа. */
export const COLUMN_X = {
  left: 120,
  right: 480,
} as const;

/** Пределы масштабирования карты. */
export const ZOOM = {
  min: 0.4,
  max: 2,
  step: 0.2,
} as const;
