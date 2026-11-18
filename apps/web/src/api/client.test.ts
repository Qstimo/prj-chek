import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from './client';
import { ApiError } from './errors';

describe('apiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(response: Partial<Response>): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      ...response,
    });

    vi.stubGlobal('fetch', fetchMock);

    return fetchMock;
  }

  it('отправляет cookie сессии', async () => {
    // Без этого браузер не приложит cookie к запросу, и сессия не сработает.
    const fetchMock = stubFetch({ json: async () => ({ ok: true }) });

    await apiClient('/projects');

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' });
  });

  it('возвращает разобранный ответ', async () => {
    stubFetch({ json: async () => [{ id: '1' }] });

    expect(await apiClient('/projects')).toEqual([{ id: '1' }]);
  });

  it('бросает ApiError с кодом ответа', async () => {
    stubFetch({ ok: false, status: 403, json: async () => ({ message: 'Недостаточно прав' }) });

    await expect(apiClient('/projects')).rejects.toBeInstanceOf(ApiError);
  });

  it('сохраняет код ответа в ошибке', async () => {
    stubFetch({ ok: false, status: 404, json: async () => ({}) });

    await expect(apiClient('/projects')).rejects.toMatchObject({ status: 404 });
  });

  it('переживает ответ без тела', async () => {
    // 204 не имеет тела, и попытка его разобрать упала бы.
    stubFetch({
      status: 204,
      json: async () => {
        throw new Error('нет тела');
      },
    });

    expect(await apiClient('/users/1/revoke', { method: 'POST' })).toBeNull();
  });

  it('передаёт тело запроса как JSON', async () => {
    const fetchMock = stubFetch({});

    await apiClient('/projects', { method: 'POST', body: { name: 'Проект' } });

    const [, init] = fetchMock.mock.calls[0] ?? [];

    expect(init).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ name: 'Проект' }),
    });
  });

  it('объект по-прежнему сериализуется в JSON', async () => {
    // Сторож прежнего поведения: сырое тело не изменило ни одного из
    // существующих запросов.
    const fetchMock = stubFetch({});

    await apiClient('/путь', { method: 'POST', body: { a: 1 } });

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: '{"a":1}',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('сырое тело уходит как есть, с заданным типом', async () => {
    // Для мелких сырых тел: двухгигабайтную запись этим путём не ведут —
    // `fetch` не даёт прогресса отправки (дизайн, 8.4).
    const fetchMock = stubFetch({});
    const blob = new Blob([new Uint8Array([1, 2, 3])]);

    await apiClient('/путь', { method: 'POST', body: blob, contentType: 'audio/mpeg' });

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: blob,
      headers: { 'Content-Type': 'audio/mpeg' },
    });
  });
});
