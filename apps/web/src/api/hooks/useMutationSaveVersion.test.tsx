import { PlatformReleaseState, RoadmapVersionState } from '@cairn/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMutationSaveVersion } from './useMutationSaveVersion';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const VERSION_ID = '22222222-2222-2222-2222-222222222222';
const API_ID = '33333333-3333-3333-3333-333333333333';
const STORE_ID = '44444444-4444-4444-4444-444444444444';

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Успешный ответ на любой запрос. */
function okFetch() {
  return vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
}

/** Адреса запросов в порядке их отправки. */
function urlsOf(fetchMock: ReturnType<typeof okFetch>): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

describe('сохранение черновика версии', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('пустой патч не трогает версию', async () => {
    // Иначе каждый щелчок по «Сохранить» переписывал бы версию теми же
    // значениями и засорял журнал правкой без правки.
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationSaveVersion(PROJECT_ID), { wrapper });

    result.current.mutate({
      versionId: VERSION_ID,
      patch: {},
      ops: [{ platformId: API_ID, kind: 'clear' }],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(urlsOf(fetchMock)).toEqual([
      `/api/projects/${PROJECT_ID}/roadmap/versions/${VERSION_ID}/releases/${API_ID}`,
    ]);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' });
  });

  it('версия идёт первой, выпуски — в порядке списка', async () => {
    // Паспорт первым: при ошибке на выпуске он уже на месте, а смена
    // состояния версии вместе с выпусками читается как одно действие.
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationSaveVersion(PROJECT_ID), { wrapper });

    result.current.mutate({
      versionId: VERSION_ID,
      patch: { state: RoadmapVersionState.Released },
      ops: [
        {
          platformId: API_ID,
          kind: 'set',
          input: {
            state: PlatformReleaseState.Released,
            releasedDate: '2026-03-02',
            buildLabel: null,
          },
        },
        { platformId: STORE_ID, kind: 'clear' },
      ],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(urlsOf(fetchMock)).toEqual([
      `/api/projects/${PROJECT_ID}/roadmap/versions/${VERSION_ID}`,
      `/api/projects/${PROJECT_ID}/roadmap/versions/${VERSION_ID}/releases/${API_ID}`,
      `/api/projects/${PROJECT_ID}/roadmap/versions/${VERSION_ID}/releases/${STORE_ID}`,
    ]);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PATCH' });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'PUT' });
  });

  it('роадмап перечитывается один раз', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationSaveVersion(PROJECT_ID), { wrapper });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    result.current.mutate({
      versionId: VERSION_ID,
      patch: { label: 'v1.1' },
      ops: [{ platformId: API_ID, kind: 'clear' }],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));

    expect(keys).toEqual([JSON.stringify(['roadmap', PROJECT_ID])]);
  });

  it('ошибка посередине отвергает мутацию, но роадмап всё равно перечитывается', async () => {
    // Отката нет: честный отчёт «что записано, что нет» лучше обещания
    // атомарности, которого в основе не было.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
      .mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ message: 'Состояние платформе не подходит' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationSaveVersion(PROJECT_ID), { wrapper });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    result.current.mutate({
      versionId: VERSION_ID,
      patch: { label: 'v1.1' },
      ops: [
        {
          platformId: API_ID,
          kind: 'set',
          input: { state: PlatformReleaseState.InReview, releasedDate: null, buildLabel: null },
        },
        { platformId: STORE_ID, kind: 'clear' },
      ],
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    // Третий запрос не ушёл: остаток черновика остаётся несохранённым
    // и виден в панели.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledOnce();
  });
});
