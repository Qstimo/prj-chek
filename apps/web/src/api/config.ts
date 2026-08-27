/**
 * Адрес API для браузера.
 *
 * Относительный путь: браузер и API живут за одним реверс-прокси на одном
 * домене, поэтому CORS не нужен и cookie работает как first-party (спека 3.3).
 */
export const BROWSER_API_URL = '/api';

/**
 * Адрес API для серверных компонентов.
 *
 * Внутренний адрес контейнера: запрос не выходит наружу, а публичный адрес
 * на сервере может быть недоступен вовсе.
 */
export function serverApiUrl(): string {
  return process.env.CAIRN_INTERNAL_API_URL ?? 'http://localhost:3001/api';
}
