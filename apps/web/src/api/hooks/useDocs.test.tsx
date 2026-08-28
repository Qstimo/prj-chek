import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMutationCreateDocPage, useMutationDeleteDocPage } from './useDocs';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const PAGE_ID = '22222222-2222-2222-2222-222222222222';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('мутации страниц документации', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('создаёт страницу по адресу проекта', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: PAGE_ID, title: 'Развёртывание' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationCreateDocPage(PROJECT_ID), { wrapper });

    result.current.mutate({ title: 'Развёртывание', content: '# Шаги' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/projects/${PROJECT_ID}/docs`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('удаляет страницу по её адресу', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 204, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationDeleteDocPage(PROJECT_ID), { wrapper });

    result.current.mutate(PAGE_ID);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/projects/${PROJECT_ID}/docs/${PAGE_ID}`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' });
  });

  it('сообщает об отказе в правах', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }),
    );

    const { result } = renderHook(() => useMutationDeleteDocPage(PROJECT_ID), { wrapper });

    result.current.mutate(PAGE_ID);

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
