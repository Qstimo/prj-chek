import { EnvironmentKind } from '@cairn/shared';

/** Названия видов окружения на языке интерфейса. */
export const KIND_LABELS: Record<EnvironmentKind, string> = {
  [EnvironmentKind.Production]: 'Продакшен',
  [EnvironmentKind.Staging]: 'Стейдж',
  [EnvironmentKind.Development]: 'Разработка',
  [EnvironmentKind.Other]: 'Иное',
};

/** Подписи серверных параметров. */
export const FIELD_LABELS = {
  host: 'Хост',
  ip: 'IP-адрес',
  provider: 'Провайдер',
  specs: 'Характеристики',
  healthCheckUrl: 'Адрес проверки',
  notes: 'Заметки',
} as const;
