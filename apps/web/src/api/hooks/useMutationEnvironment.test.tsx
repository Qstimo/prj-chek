import { EnvironmentKind } from '@cairn/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  useMutationCreateEnvironment,
  useMutationDeleteEnvironment,
} from './useMutationEnvironment';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('мутации окружения', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('создаёт окружение по адресу проекта', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: '1', name: 'Прод' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationCreateEnvironment(PROJECT_ID), { wrapper });

    result.current.mutate({ name: 'Прод', kind: EnvironmentKind.Production });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/projects/${PROJECT_ID}/environments`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('удаляет окружение по его адресу', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 204, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationDeleteEnvironment(PROJECT_ID), { wrapper });

    result.current.mutate('22222222-2222-2222-2222-222222222222');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/projects/${PROJECT_ID}/environments/22222222-2222-2222-2222-222222222222`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' });
  });

  it('сообщает об отказе в правах', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }),
    );

    const { result } = renderHook(() => useMutationDeleteEnvironment(PROJECT_ID), { wrapper });

    result.current.mutate('22222222-2222-2222-2222-222222222222');

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
