import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMutationCreateProject } from './useMutationCreateProject';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useMutationCreateProject', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('отправляет название на создание', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: '1', name: 'Проект' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationCreateProject(), { wrapper });

    result.current.mutate({ name: 'Проект' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/projects');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('сообщает об отказе в правах', async () => {
    // Создавать проекты вправе только суперадмин (спека 4.4).
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }),
    );

    const { result } = renderHook(() => useMutationCreateProject(), { wrapper });

    result.current.mutate({ name: 'Проект' });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
