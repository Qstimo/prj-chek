'use client';

import { BROWSER_API_URL } from './config';
import { readResponse, type ResponseParse } from './response';

/** Параметры запроса. */
export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Вид тела успешного ответа. Текст нужен выгрузке `.env`. */
  parse?: ResponseParse;
  /**
   * Тип сырого тела: `Blob` и `ArrayBuffer` уходят как есть.
   *
   * Нужен **мелким** сырым телам. Запись созвона этим путём не ведут:
   * `fetch` не даёт прогресса отправки, а на двух гигабайтах прогресс
   * обязателен, и для неё рядом живёт `uploadRecording` (дизайн, 8.4).
   */
  contentType?: string;
}

/**
 * Запрос к API из браузера.
 *
 * `credentials: 'include'` обязателен: без него браузер не приложит cookie
 * сессии, и любой защищённый маршрут ответит отказом.
 */
export async function apiClient<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const isRaw = isRawBody(options.body);
  const response = await fetch(`${BROWSER_API_URL}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: options.body
      ? { 'Content-Type': options.contentType ?? (isRaw ? OCTET_STREAM : 'application/json') }
      : undefined,
    body: options.body
      ? ((isRaw ? options.body : JSON.stringify(options.body)) as BodyInit)
      : undefined,
    signal: options.signal,
  });

  return readResponse<T>(response, options.parse);
}

/** Тип сырого тела, когда свой не назвали: «просто байты». */
const OCTET_STREAM = 'application/octet-stream';

/** Сырое тело уходит без сериализации: сериализовать байты нечем. */
function isRawBody(body: unknown): boolean {
  return body instanceof Blob || body instanceof ArrayBuffer;
}
