import { PlatformKind } from '@cairn/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  useMutationCreatePlatform,
  useMutationDeletePlatform,
  useMutationUpdatePlatform,
} from './usePlatforms';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const PLATFORM_ID = '22222222-2222-2222-2222-222222222222';

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('мутации платформ', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('заводит платформу по адресу проекта и сбрасывает роадмап вместе со списком', async () => {
    // Сводка релизов живёт в ответе роадмапа: без её сброса новая
    // платформа не появилась бы в сводке до перезагрузки страницы.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: PLATFORM_ID }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationCreatePlatform(PROJECT_ID), { wrapper });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    result.current.mutate({ kind: PlatformKind.Server, name: 'API' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/projects/${PROJECT_ID}/platforms`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });

    const keys = invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));

    expect(keys).toContain(JSON.stringify(['platforms', PROJECT_ID]));
    expect(keys).toContain(JSON.stringify(['roadmap', PROJECT_ID]));
  });

  it('правит имя платформы по её адресу', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: PLATFORM_ID }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationUpdatePlatform(PROJECT_ID), { wrapper });

    result.current.mutate({ platformId: PLATFORM_ID, input: { name: 'Веб-админка' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/projects/${PROJECT_ID}/platforms/${PLATFORM_ID}`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PATCH' });
  });

  it('удаляет платформу', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 204, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationDeletePlatform(PROJECT_ID), { wrapper });

    result.current.mutate(PLATFORM_ID);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' });
  });
});
