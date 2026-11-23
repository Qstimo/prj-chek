import {
  TRACKER_UNAVAILABLE,
  TaskExportOutcome,
  type TaskExportResult,
} from '@cairn/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ROADMAP_KEYS } from './useQueryRoadmap';
import { TASK_KEYS, useMutationExportTasks } from './useTasks';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const FIRST = '22222222-2222-2222-2222-222222222222';
const SECOND = '33333333-3333-3333-3333-333333333333';

/** Итог по одной задаче так, как его отдаёт ручка. */
function resultOf(
  taskId: string,
  outcome: TaskExportOutcome,
  failureCode: string | null = null,
): TaskExportResult {
  return { taskId, outcome, failureCode, export: null };
}

/** Обёртка над своим клиентом: инвалидацию проверяют на нём же. */
function wrapperOf(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** Клиент без повторов: падение мутации не должно ждать трёх попыток. */
function freshClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/**
 * Ответ, которым довольна ручка выгрузки.
 *
 * Умолчание — итог на одну уехавшую задачу, а не пустой объект: ручка
 * отвечает набором итогов (контракт, `taskExportResultSchema`), и тело не по
 * контракту удачей уже не считается.
 */
function okFetch(payload: unknown = [resultOf(FIRST, TaskExportOutcome.Created)]) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => payload });

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

describe('выгрузка задач в трекер', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('уходит одной ручкой и одним набором', async () => {
    // Одна ручка на одну и на много задач (план, C2): набор из одного
    // элемента и есть одна задача. Доски и колонки в теле нет — они
    // приходят привязкой проекта, иначе задача уехала бы на чужую доску
    // мимо настройки.
    const fetchMock = okFetch();
    const { result } = renderHook(() => useMutationExportTasks(PROJECT_ID), {
      wrapper: wrapperOf(freshClient()),
    });

    result.current.mutate([FIRST, SECOND]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/projects/${PROJECT_ID}/tasks/export`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ taskIds: [FIRST, SECOND] }),
    });
  });

  it('перечитывает и реестр, и роадмап', async () => {
    // Зеркало выгрузки лежит у задачи, а задачу показывают оба экрана:
    // реестр — биркой, роадмап — той же формулировкой в версии. Сбросить
    // один из двух значило бы оставить на другом вид до выгрузки.
    okFetch();

    const client = freshClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useMutationExportTasks(PROJECT_ID), {
      wrapper: wrapperOf(client),
    });

    result.current.mutate([FIRST]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: TASK_KEYS.forProject(PROJECT_ID) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ROADMAP_KEYS.forProject(PROJECT_ID) });
  });

  it('возвращает итог по каждой задаче набора', async () => {
    // Итог у набора не один, и лежит он **в теле**: сервер отвечает `201`
    // и когда обмен не удался. Выброшенное тело означало бы, что о
    // неудавшейся задаче на экране не сказано ничего — при первом отказе
    // строки зеркала не возникает вовсе, и перечитанный реестр о ней
    // молчит.
    okFetch([
      resultOf(FIRST, TaskExportOutcome.Failed, TRACKER_UNAVAILABLE),
      resultOf(SECOND, TaskExportOutcome.Skipped),
    ]);

    const { result } = renderHook(() => useMutationExportTasks(PROJECT_ID), {
      wrapper: wrapperOf(freshClient()),
    });

    result.current.mutate([FIRST, SECOND]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { taskId: FIRST, outcome: TaskExportOutcome.Failed, failureCode: TRACKER_UNAVAILABLE, export: null },
      { taskId: SECOND, outcome: TaskExportOutcome.Skipped, failureCode: null, export: null },
    ]);
  });

  it('тело не по контракту не выдаётся за итог', async () => {
    // Схемой контракта, а не доверием к форме: исход, которого в перечне
    // нет, посчитался бы ни одним из четырёх — то есть набор из трёх задач
    // показал бы «заведено 0, не вышло 0» и соврал бы ровно там, где
    // человек решает, повторять ли выгрузку.
    okFetch([{ taskId: FIRST, outcome: 'maybe', failureCode: null, export: null }]);

    const { result } = renderHook(() => useMutationExportTasks(PROJECT_ID), {
      wrapper: wrapperOf(freshClient()),
    });

    result.current.mutate([FIRST]);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('Выгрузка');
  });

  it('нечитаемый итог всё равно перечитывает реестр', async () => {
    // Тело не разобралось — но задачи-то уехали: отказ приходит кодом HTTP
    // и только до первого байта наружу (контракт,
    // `taskExportResultSchema`). Перечитать обязаны, иначе колонка
    // «Выгрузка» осталась бы с видом до выгрузки, и это единственное
    // место, где правду ещё можно увидеть.
    okFetch({ oops: true });

    const client = freshClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useMutationExportTasks(PROJECT_ID), {
      wrapper: wrapperOf(client),
    });

    result.current.mutate([FIRST]);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: TASK_KEYS.forProject(PROJECT_ID) });
  });
});
