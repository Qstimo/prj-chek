import { RoadmapVersionState, SUMMARY_TEXT_TOO_LONG } from '@cairn/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { summaryFailureOf } from '../summary-failure';
import { SUMMARY_KEYS } from './useQuerySummaries';
import {
  useMutationArchiveSummaryTasks,
  useMutationRestoreSummaryTasks,
  useMutationRemoveSummaryTasks,
  useMutationCreateSummary,
  useMutationReleaseSummary,
  useMutationTransferSummaryTasks,
  useMutationSaveSummaryTasks,
} from './useMutationSummary';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const SUMMARY_ID = '22222222-2222-2222-2222-222222222222';
const TASK_ID = '33333333-3333-3333-3333-333333333333';

const RELEASE_BODY = {
  taskIds: [TASK_ID],
  target: {
    kind: 'new' as const,
    version: {
      label: 'v1.3',
      state: RoadmapVersionState.Planned,
      plannedDate: '2026-12-01',
    },
  },
};

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Успешный ответ на любой запрос. */
function okFetch(payload: unknown = {}) {
  return vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload });
}

/** Тело первого отправленного запроса. */
function bodyOf(fetchMock: ReturnType<typeof okFetch>): unknown {
  return JSON.parse(String((fetchMock.mock.calls[0]?.[1] as { body?: string })?.body));
}

describe('мутации саммари', () => {
  it('переносит выбор в реестр своей ручкой и перечитывает задачи', async () => {
    const fetchMock = okFetch({ taskIds: [SUMMARY_ID] });
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useMutationTransferSummaryTasks(PROJECT_ID, SUMMARY_ID), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await result.current.mutateAsync({ taskIds: [SUMMARY_ID] });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/projects/${PROJECT_ID}/summaries/${SUMMARY_ID}/tasks/transfer`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ taskIds: [SUMMARY_ID] }) }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', PROJECT_ID] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: SUMMARY_KEYS.all });
    client.clear();
  });
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('создание уходит по адресу выбранного в форме проекта', async () => {
    // Проект — аргумент вызова: его выбирают в форме, и хук, получивший
    // его при отрисовке, отправил бы запрос по прежнему выбору.
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationCreateSummary(), { wrapper });

    result.current.mutate({
      projectId: PROJECT_ID,
      input: { occurredOn: '2026-11-16', title: 'Созвон', text: 'обсудили сроки' },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/projects/${PROJECT_ID}/summaries`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('сохранение черновика посылает только формулировки и порядок', async () => {
    // Позиции сервер нумерует сам по порядку массива.
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationSaveSummaryTasks(PROJECT_ID, SUMMARY_ID), {
      wrapper,
    });

    result.current.mutate({ tasks: [{ title: 'раз' }, { id: TASK_ID, title: 'два' }] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/projects/${PROJECT_ID}/summaries/${SUMMARY_ID}/tasks`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT' });
    expect(bodyOf(fetchMock)).toEqual({
      tasks: [{ title: 'раз' }, { id: TASK_ID, title: 'два' }],
    });
  });

  it.each([
    ['archive', useMutationArchiveSummaryTasks],
    ['restore', useMutationRestoreSummaryTasks],
    ['remove', useMutationRemoveSummaryTasks],
  ] as const)(
    '%s отправляет выбранные задачи и сбрасывает деталь и историю',
    async (action, useChange) => {
      const fetchMock = okFetch();
      vi.stubGlobal('fetch', fetchMock);
      const invalidate = vi.spyOn(client, 'invalidateQueries');
      const { result } = renderHook(() => useChange(PROJECT_ID, SUMMARY_ID), { wrapper });

      const selection = { taskIds: ['task-id'] };
      result.current.mutate(selection);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(fetchMock).toHaveBeenCalledWith(
        `/api/projects/${PROJECT_ID}/summaries/${SUMMARY_ID}/tasks/${action}`,
        expect.objectContaining({ method: 'POST' }),
      );
      expect(bodyOf(fetchMock)).toEqual(selection);
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['summaries'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['summaries', PROJECT_ID, SUMMARY_ID] });
    },
  );

  it('формирование релиза уходит по адресу саммари и телом формы', async () => {
    // Что `releasedDate` в теле не бывает, проверяется там, где тело
    // собирается, — в форме (`SummaryReleaseForm.test.tsx`) и на экране
    // (`SummaryScreen.test.tsx`). Здесь входом служила константа этого же
    // файла, в которой `releasedDate` нет: такой assert верен при любой
    // реализации хука, который тело только пересылает.
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationReleaseSummary(PROJECT_ID, SUMMARY_ID), {
      wrapper,
    });

    result.current.mutate(RELEASE_BODY);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/projects/${PROJECT_ID}/summaries/${SUMMARY_ID}/tasks/release`,
    );
    expect(bodyOf(fetchMock)).toEqual(RELEASE_BODY);
  });

  it('успешный релиз сбрасывает кэши саммари, хроники и роадмапа', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationReleaseSummary(PROJECT_ID, SUMMARY_ID), {
      wrapper,
    });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    result.current.mutate(RELEASE_BODY);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));

    expect(keys).toContain(JSON.stringify(['summaries']));
    expect(keys).toContain(JSON.stringify(['chronicle', PROJECT_ID]));
    expect(keys).toContain(JSON.stringify(['roadmap', PROJECT_ID]));
  });

  it('код отказа достаётся из тела вместе с пределом объёма', async () => {
    // Экран объясняет отказ по коду, а предел называет настоящим числом
    // из ответа: придуманное число соврало бы о настройке узла.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ code: SUMMARY_TEXT_TOO_LONG, maxChars: 40_000, message: 'Длинно' }),
      }),
    );

    const { result } = renderHook(() => useMutationReleaseSummary(PROJECT_ID, SUMMARY_ID), {
      wrapper,
    });

    result.current.mutate(RELEASE_BODY);

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(summaryFailureOf(result.current.error)).toEqual({
      code: SUMMARY_TEXT_TOO_LONG,
      maxChars: 40_000,
    });
  });

  it('отказ без кода остаётся без кода, а не выдумывает его', async () => {
    // Сеть, `401` и прочее приходят без тела: подменять их кодом порта
    // значило бы объяснить человеку не то, что случилось.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );

    const { result } = renderHook(() => useMutationReleaseSummary(PROJECT_ID, SUMMARY_ID), {
      wrapper,
    });

    result.current.mutate(RELEASE_BODY);

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(summaryFailureOf(result.current.error).code).toBeUndefined();
  });
});
