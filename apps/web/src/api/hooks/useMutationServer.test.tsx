import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  useMutationCreateServer,
  useMutationDeleteServer,
  useMutationUpdateServer,
} from './useMutationServer';

const SERVER_ID = '11111111-1111-1111-1111-111111111111';

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('мутации сервера', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('заводит сервер по адресу реестра', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: SERVER_ID, name: 'hetzner-fsn-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationCreateServer(), { wrapper });

    result.current.mutate({ name: 'hetzner-fsn-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/servers');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('правит сервер по его адресу', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: SERVER_ID }) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationUpdateServer(), { wrapper });

    result.current.mutate({ id: SERVER_ID, input: { paidUntil: '2027-01-01' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/servers/${SERVER_ID}`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PATCH' });
  });

  it('сбрасывает и статусы проектов, а не только реестр', async () => {
    // Срок оплаты машины поднимает индикатор каждого проекта на ней:
    // оставить статусы в кэше значило бы показывать вчерашнюю картину.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => ({}) }),
    );

    const { result } = renderHook(() => useMutationDeleteServer(), { wrapper });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    result.current.mutate(SERVER_ID);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));

    expect(keys).toContain(JSON.stringify(['servers']));
    expect(keys).toContain(JSON.stringify(['status']));
  });

  it('сообщает об отказе удалить занятый сервер', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({}) }),
    );

    const { result } = renderHook(() => useMutationDeleteServer(), { wrapper });

    result.current.mutate(SERVER_ID);

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
