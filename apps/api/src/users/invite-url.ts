import type { IssuedLinkResponse } from '@cairn/shared';

import type { IssuedLink } from '../invitations/invitations.types';

/**
 * Строит адрес, по которому человек задаст пароль.
 *
 * Адрес веб-приложения берётся из окружения: бэкенд не знает его сам,
 * а зашитый в код адрес сломался бы при первом же переносе.
 */
export function buildInviteUrl(link: IssuedLink): IssuedLinkResponse {
  const base = process.env.CAIRN_WEB_URL ?? 'http://localhost:3000';

  return {
    url: `${base}/invite/${link.token}`,
    expiresAt: link.expiresAt.toISOString(),
  };
}

export type { IssuedLinkResponse };
