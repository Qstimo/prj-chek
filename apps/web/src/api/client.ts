'use client';

import { BROWSER_API_URL } from './config';
import { readResponse } from './response';

/** Параметры запроса. */
export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Запрос к API из браузера.
 *
 * `credentials: 'include'` обязателен: без него браузер не приложит cookie
 * сессии, и любой защищённый маршрут ответит отказом.
 */
export async function apiClient<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await fetch(`${BROWSER_API_URL}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  return readResponse<T>(response);
}
