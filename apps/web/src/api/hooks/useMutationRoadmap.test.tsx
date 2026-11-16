import { CARRY_OVER_NEEDS_LABEL } from '@cairn/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../errors';
import {
  useMutationCarryOverCheckpoint,
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

  it('переносит чекпоинт в следующую открытую версию', async () => {
    // Пустое тело — это «следующая открытая версия»: правило живёт на
    // сервере, и второй его экземпляр в браузере с ним разошёлся бы.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        checkpoint: { id: CHECKPOINT_ID },
        targetVersion: { id: VERSION_ID, label: 'v1.3' },
        versionCreated: false,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationCarryOverCheckpoint(PROJECT_ID), { wrapper });

    result.current.mutate({ versionId: VERSION_ID, checkpointId: CHECKPOINT_ID });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/projects/${PROJECT_ID}/roadmap/versions/${VERSION_ID}/checkpoints/${CHECKPOINT_ID}/carry-over`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', body: '{}' });
    expect(result.current.data?.targetVersion.label).toBe('v1.3');
  });

  it('переносит в новую версию по обозначению', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        checkpoint: { id: CHECKPOINT_ID },
        targetVersion: { id: VERSION_ID, label: 'v1.3' },
        versionCreated: true,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationCarryOverCheckpoint(PROJECT_ID), { wrapper });

    result.current.mutate({
      versionId: VERSION_ID,
      checkpointId: CHECKPOINT_ID,
      input: { newVersionLabel: 'v1.3' },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ newVersionLabel: 'v1.3' }),
    });
    expect(result.current.data?.versionCreated).toBe(true);
  });

  it('отказ «нужна новая версия» доносит код до вызывающего', async () => {
    // Код, а не разбор текста: по нему панель спрашивает обозначение
    // новой версии и повторяет перенос.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ code: CARRY_OVER_NEEDS_LABEL, message: 'Открытой версии нет' }),
      }),
    );

    const { result } = renderHook(() => useMutationCarryOverCheckpoint(PROJECT_ID), { wrapper });

    result.current.mutate({ versionId: VERSION_ID, checkpointId: CHECKPOINT_ID });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const error = result.current.error;

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).details).toMatchObject({ code: CARRY_OVER_NEEDS_LABEL });
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
