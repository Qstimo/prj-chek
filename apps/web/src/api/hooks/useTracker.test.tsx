import { TrackerKind } from '@cairn/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  useMutationClearTrackerConnection,
  useMutationProbeTracker,
  useMutationSaveTrackerBinding,
  useMutationSaveTrackerConnection,
  useQueryProjectTracker,
  useQueryTrackerConnection,
  useQueryTrackerTargets,
} from './useTracker';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Ответ, которым довольна любая из ручек трекера. */
function okFetch(payload: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload });

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

describe('подключение трекера', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('читается по адресу вида трекера', async () => {
    // Вид в адресе, а не в теле: он первичный ключ строки подключения, и
    // тело, способное его переписать, правило бы не ту настройку.
    const fetchMock = okFetch({ kind: TrackerKind.Weeek, hasSecret: false });
    const { result } = renderHook(() => useQueryTrackerConnection(TrackerKind.Weeek), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/tracker-connections/weeek');
  });

  it('сохраняется целиком, и пустой токен уходит отсутствием поля', async () => {
    const fetchMock = okFetch({ kind: TrackerKind.Weeek, hasSecret: true });
    const { result } = renderHook(() => useMutationSaveTrackerConnection(TrackerKind.Weeek), {
      wrapper,
    });

    result.current.mutate({
      baseUrl: 'https://api.weeek.net/public/v1',
      workspaceId: null,
      isEnabled: true,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/tracker-connections/weeek');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT' });
    expect(fetchMock.mock.calls[0]?.[1]?.body).not.toContain('secret');
  });

  it('снимается своим запросом', async () => {
    const fetchMock = okFetch({});
    const { result } = renderHook(() => useMutationClearTrackerConnection(TrackerKind.Weeek), {
      wrapper,
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/tracker-connections/weeek');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' });
  });

  it('проверка связи идёт своей ручкой и ничего не сохраняет', async () => {
    const fetchMock = okFetch({ outcome: 'ok', status: 200, host: 'api.weeek.net', durationMs: 90 });
    const { result } = renderHook(() => useMutationProbeTracker(TrackerKind.Weeek), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/tracker-connections/weeek/probe');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
    expect(result.current.data?.host).toBe('api.weeek.net');
  });
});

describe('трекер со стороны проекта', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('готовность и привязка приходят одной дешёвой выдачей', async () => {
    const fetchMock = okFetch({ isOperational: true, blockedBy: null, binding: null });
    const { result } = renderHook(() => useQueryProjectTracker(PROJECT_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/projects/${PROJECT_ID}/tracker`);
  });

  it('списки целей не запрашиваются, пока панель закрыта', async () => {
    // За списками стоит живой запрос в трекер: спрашивать их на каждом
    // открытии роадмапа значило бы платить чужим пределом частоты за
    // экран, на котором привязку никто не правит.
    const fetchMock = okFetch({ projects: [], boards: [], columns: [] });

    renderHook(() => useQueryTrackerTargets(PROJECT_ID, false), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('списки целей идут через нашу ручку, а не в трекер из браузера', async () => {
    const fetchMock = okFetch({ projects: [], boards: [], columns: [] });
    const { result } = renderHook(() => useQueryTrackerTargets(PROJECT_ID, true), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/projects/${PROJECT_ID}/tracker/targets`);
  });

  it('привязка сохраняется тремя идентификаторами', async () => {
    const fetchMock = okFetch({
      tracker: TrackerKind.Weeek,
      externalProjectId: '7',
      boardId: '11',
      boardColumnId: '31',
      updatedAt: '2026-11-20T10:00:00.000Z',
      updatedByLabel: null,
    });
    const { result } = renderHook(() => useMutationSaveTrackerBinding(PROJECT_ID), { wrapper });

    result.current.mutate({ externalProjectId: '7', boardId: '11', boardColumnId: '31' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/projects/${PROJECT_ID}/tracker/binding`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'PUT',
      body: JSON.stringify({ externalProjectId: '7', boardId: '11', boardColumnId: '31' }),
    });
  });
});
