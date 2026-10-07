import { PlatformReleaseState } from '@cairn/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMutationClearRelease, useMutationSetRelease } from './useMutationRelease';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const VERSION_ID = '22222222-2222-2222-2222-222222222222';
const PLATFORM_ID = '33333333-3333-3333-3333-333333333333';

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('мутации выпуска', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ставит выпуск методом PUT и сбрасывает роадмап', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationSetRelease(PROJECT_ID), { wrapper });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    result.current.mutate({
      versionId: VERSION_ID,
      platformId: PLATFORM_ID,
      input: { state: PlatformReleaseState.OnTest },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/projects/${PROJECT_ID}/roadmap/versions/${VERSION_ID}/releases/${PLATFORM_ID}`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT' });

    const keys = invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));

    expect(keys).toContain(JSON.stringify(['roadmap', PROJECT_ID]));
  });

  it('снимает выпуск методом DELETE', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 204, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationClearRelease(PROJECT_ID), { wrapper });

    result.current.mutate({ versionId: VERSION_ID, platformId: PLATFORM_ID });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' });
  });
});
