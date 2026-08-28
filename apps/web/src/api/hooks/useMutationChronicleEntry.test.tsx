import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  useMutationCreateChronicleEntry,
  useMutationDeleteChronicleEntry,
} from './useMutationChronicleEntry';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const ENTRY_ID = '22222222-2222-2222-2222-222222222222';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('мутации записи хроники', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('создаёт запись по адресу проекта', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: ENTRY_ID }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationCreateChronicleEntry(PROJECT_ID), { wrapper });

    result.current.mutate({ occurredOn: '2026-08-27', title: 'Встреча', content: 'Сводка' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/projects/${PROJECT_ID}/chronicle`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('удаляет запись по её адресу', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 204, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationDeleteChronicleEntry(PROJECT_ID), { wrapper });

    result.current.mutate(ENTRY_ID);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/projects/${PROJECT_ID}/chronicle/${ENTRY_ID}`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' });
  });

  it('сообщает об отказе в правах', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }),
    );

    const { result } = renderHook(() => useMutationDeleteChronicleEntry(PROJECT_ID), { wrapper });

    result.current.mutate(ENTRY_ID);

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
