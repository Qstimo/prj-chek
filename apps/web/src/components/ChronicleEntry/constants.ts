import { ChronicleSource } from '@cairn/shared';

/** Подписи источников записи на языке интерфейса. */
export const SOURCE_LABELS: Record<ChronicleSource, string> = {
  [ChronicleSource.Manual]: 'Вручную',
  [ChronicleSource.Webhook]: 'Webhook',
};
