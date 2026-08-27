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
});
