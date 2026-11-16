import { RoadmapVersionState, SUMMARY_TEXT_TOO_LONG } from '@cairn/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  summaryFailureOf,
  useMutationCreateSummary,
  useMutationReleaseSummary,
  useMutationSaveSummaryTasks,
} from './useMutationSummary';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const SUMMARY_ID = '22222222-2222-2222-2222-222222222222';
const TASK_ID = '33333333-3333-3333-3333-333333333333';

/** Тело формирования релиза: три поля формы и ничего больше. */
const RELEASE_BODY = {
  label: 'v1.3',
  state: RoadmapVersionState.Planned,
  plannedDate: '2026-12-01',
};

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Успешный ответ на любой запрос. */
function okFetch() {
  return vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
}

/** Тело первого отправленного запроса. */
function bodyOf(fetchMock: ReturnType<typeof okFetch>): unknown {
  return JSON.parse(String((fetchMock.mock.calls[0]?.[1] as { body?: string })?.body));
}

describe('мутации саммари', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('создание уходит по адресу проекта', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationCreateSummary(PROJECT_ID), { wrapper });

    result.current.mutate({ occurredOn: '2026-11-16', title: 'Созвон', text: 'обсудили сроки' });

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

  it('формирование релиза не посылает дату релиза', async () => {
    // Её нет в форме ни при каких платформах, и `releasedDate` не уходит
    // даже как null: признак «у проекта есть платформы» производен от
    // секции «Инфо», которой у субъекта этого потока может не быть.
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationReleaseSummary(PROJECT_ID, SUMMARY_ID), {
      wrapper,
    });

    result.current.mutate(RELEASE_BODY);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(bodyOf(fetchMock)).not.toHaveProperty('releasedDate');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/projects/${PROJECT_ID}/summaries/${SUMMARY_ID}/release`,
    );
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
