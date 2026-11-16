import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useQueryAddressIncidents, useQueryIncidents } from './useQueryIncidents';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const DOMAIN_ID = '22222222-2222-2222-2222-222222222222';

function wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Ответ `fetch`, который читает `apiClient`. */
function ok(body: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
}

describe('история падений одного адреса', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('спрашивает ручку адреса с окном и пределом', async () => {
    // Ручка на один адрес нужна панели разбора: история всех адресов
    // проекта тянулась бы тремя запросами на каждый.
    const fetchMock = ok({ domainId: DOMAIN_ID, incidents: [] });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useQueryAddressIncidents(PROJECT_ID, DOMAIN_ID), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/projects/${PROJECT_ID}/addresses/${DOMAIN_ID}/incidents?windowDays=30&limit=20`,
    );
  });

  it('окно задаётся снаружи', async () => {
    const fetchMock = ok({ domainId: DOMAIN_ID, incidents: [] });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () => useQueryAddressIncidents(PROJECT_ID, DOMAIN_ID, { windowDays: 7 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('windowDays=7');
  });

  it('добавляет страницы и перепрашивает весь раскрытый список со свежими смещениями', async () => {
    let ids = Array.from({ length: 21 }, (_, index) => String(index));
    let failsOnSecondPage = false;
    const fetchMock = vi.fn(async (url: string) => {
      const offset = Number(new URL(url, 'http://localhost').searchParams.get('offset') ?? 0);

      if (failsOnSecondPage && offset === 20) {
        return { ok: false, status: 500, json: async () => ({ message: 'Ошибка истории' }) };
      }

      return { ok: true, status: 200, json: async () => ({
        domainId: DOMAIN_ID, summary: { falls: ids.length },
        incidents: ids.slice(offset, offset + 20).map((id) => ({ id })),
        offset, limit: 20, nextOffset: offset + 20 < ids.length ? offset + 20 : null,
      }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useQueryAddressIncidents(PROJECT_ID, DOMAIN_ID), { wrapper });
    await waitFor(() => expect(result.current.data?.incidents).toHaveLength(20));
    await act(async () => { await result.current.fetchNextPage(); });
    await waitFor(() => expect(result.current.data?.incidents.map((row) => row.id)).toEqual(ids));
    expect(result.current.hasNextPage).toBe(false);
    expect(fetchMock.mock.calls[1]?.[0]).toContain('offset=20');

    ids = ['new', ...ids];
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.data?.incidents.map((row) => row.id)).toEqual(ids));
    expect(result.current.data?.summary.falls).toBe(22);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const previous = result.current.data;
    expect(result.current.isError).toBe(false);
    ids = ['newer', ...ids];
    failsOnSecondPage = true;
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    // Не заменяем старые страницы частично обновлённым первым ответом.
    expect(result.current.data).toEqual(previous);

    failsOnSecondPage = false;
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.data?.incidents.map((row) => row.id)).toEqual(ids));
    expect(result.current.data?.summary.falls).toBe(23);
  });

  it('смена адреса не переносит накопленные страницы другому адресу', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200,
      json: async () => ({ incidents: [{ id: url }], nextOffset: url.includes('offset=') ? null : 20 }),
    })));
    const { result, rerender } = renderHook(({ domainId }) =>
      useQueryAddressIncidents(PROJECT_ID, domainId), { wrapper, initialProps: { domainId: DOMAIN_ID } });
    await waitFor(() => expect(result.current.data?.incidents).toHaveLength(1));
    await act(async () => { await result.current.fetchNextPage(); });
    await waitFor(() => expect(result.current.data?.incidents).toHaveLength(2));
    rerender({ domainId: 'another-address' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.incidents).toHaveLength(1);
    expect(result.current.data?.incidents[0]?.id).toContain('another-address');
  });

  it('без адреса не ходит вовсе: панель закрыта', () => {
    const fetchMock = ok({});
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useQueryAddressIncidents(PROJECT_ID, null), { wrapper });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('отсутствие доступа — это пустая история, а не ошибка', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }),
    );

    const { result } = renderHook(() => useQueryAddressIncidents(PROJECT_ID, DOMAIN_ID), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('ошибка первой страницы остаётся ошибкой, а не пустой историей', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500, json: async () => ({ message: 'Ошибка истории' }),
    }));
    const { result } = renderHook(() => useQueryAddressIncidents(PROJECT_ID, DOMAIN_ID), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

describe('инциденты проекта', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('не ходит, пока статус не открыл секцию', () => {
    // Запрос звался безусловно, в том числе у того, кому секция не видна.
    const fetchMock = ok([]);
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useQueryIncidents(PROJECT_ID, { enabled: false }), { wrapper });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('перепрашивает сервер сам: статус устаревает без действий человека', async () => {
    vi.useFakeTimers();

    const fetchMock = ok([]);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useQueryIncidents(PROJECT_ID), { wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.isSuccess).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);

    vi.useRealTimers();
  });
});
