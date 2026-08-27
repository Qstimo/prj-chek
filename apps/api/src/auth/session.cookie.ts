import type { CookieOptions } from 'express';

/** Имя cookie с токеном сессии. */
export const SESSION_COOKIE = 'cairn_session';

/**
 * Настройки cookie сессии (спека 6.3).
 *
 * `httpOnly` закрывает токен от скриптов страницы, `sameSite: lax` защищает
 * от межсайтовых запросов, `secure` включается вне разработки — по HTTP
 * такая cookie просто не установится, и локальная разработка сломалась бы.
 */
export const SESSION_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};
