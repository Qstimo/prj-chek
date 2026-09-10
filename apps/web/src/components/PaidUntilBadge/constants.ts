/** Состояние срока оплаты. Задаётся текстом, а не только цветом. */
export const STATE_STYLES = {
  ok: 'text-muted-foreground',
  soon: 'text-amber-600 dark:text-amber-500',
  expired: 'text-destructive',
  unknown: 'text-muted-foreground',
} as const;
