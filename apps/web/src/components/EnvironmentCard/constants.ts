import { EnvironmentKind } from '@cairn/shared';

/** Названия видов окружения на языке интерфейса. */
export const KIND_LABELS: Record<EnvironmentKind, string> = {
  [EnvironmentKind.Production]: 'Продакшен',
  [EnvironmentKind.Staging]: 'Стейдж',
  [EnvironmentKind.Development]: 'Разработка',
  [EnvironmentKind.Other]: 'Иное',
};

/** Подписи полей окружения и его машины. */
export const FIELD_LABELS = {
  host: 'Адрес машины',
  server: 'Сервер',
  owner: 'Владелец',
  ip: 'IP-адрес',
  provider: 'Провайдер',
  specs: 'Характеристики',
  healthCheckPath: 'Путь проверки',
  platforms: 'Развёрнуто',
  notes: 'Заметки',
} as const;

/**
 * Адрес карточки машины в реестре.
 *
 * Именно `/edit`: отдельной страницы просмотра машины в приложении нет,
 * карточка и форма — одно и то же место (как у корневого домена рядом).
 */
export function serverHref(serverId: string): string {
  return `/servers/${serverId}/edit`;
}

/** Адрес карточки корневого домена в реестре. */
export function rootDomainHref(domainId: string): string {
  return `/domains/${domainId}/edit`;
}

/** Подпись ссылки на корень адреса. */
export function rootDomainLabel(name: string): string {
  return `Корень ${name}`;
}

/**
 * Адрес реестра корневых доменов целиком.
 *
 * Запасной путь на случай, когда идентификаторов корней в ответе нет:
 * на проекции метаданных поля `rootDomains` не существует вовсе.
 */
export const DOMAINS_HREF = '/domains';
