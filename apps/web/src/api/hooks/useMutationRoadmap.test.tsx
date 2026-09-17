import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  useMutationCreateVersion,
  useMutationReadLinkTitle,
  useMutationUpdateCheckpoint,
} from './useMutationRoadmap';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const VERSION_ID = '22222222-2222-2222-2222-222222222222';
const CHECKPOINT_ID = '33333333-3333-3333-3333-333333333333';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('мутации роадмапа', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('создаёт версию по адресу роадмапа', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: VERSION_ID, label: 'v1.0' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationCreateVersion(PROJECT_ID), { wrapper });

    result.current.mutate({ label: 'v1.0' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/projects/${PROJECT_ID}/roadmap/versions`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('переключает чекпоинт PATCH-запросом', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: CHECKPOINT_ID, isDone: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationUpdateCheckpoint(PROJECT_ID), { wrapper });

    result.current.mutate({ versionId: VERSION_ID, checkpointId: CHECKPOINT_ID, input: { isDone: true } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/projects/${PROJECT_ID}/roadmap/versions/${VERSION_ID}/checkpoints/${CHECKPOINT_ID}`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PATCH' });
  });

  it('сообщает об отказе в правах', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }),
    );

    const { result } = renderHook(() => useMutationCreateVersion(PROJECT_ID), { wrapper });

    result.current.mutate({ label: 'v1.0' });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('читает заголовок по ссылке на задачу', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ title: 'Перевести биллинг' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationReadLinkTitle(PROJECT_ID), { wrapper });

    result.current.mutate('https://tracker.example.com/TASK-17');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/projects/${PROJECT_ID}/roadmap/link-title`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
    expect(result.current.data).toBe('Перевести биллинг');
  });
});
