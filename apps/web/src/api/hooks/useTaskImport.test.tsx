import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMutationImportTasks, useQueryImportTasks } from './useTaskImport';

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
afterEach(() => vi.unstubAllGlobals());
describe('хуки импорта Weeek', () => {
  it('до применения фильтров не делает запрос; передаёт фильтры строкой запроса', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ tasks: [], people: [], peopleAvailable: true, truncated: false }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const { client, wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useQueryImportTasks(
          'project',
          enabled
            ? {
                boardId: '11',
                status: 'completed',
                dateField: 'createdAt',
                dateFrom: '2026-11-01',
                assigneeId: 'u1',
              }
            : undefined,
        ),
      { wrapper, initialProps: { enabled: false } },
    );
    expect(fetchMock).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), 'https://cairn.test');
    expect(url.searchParams.get('dateField')).toBe('createdAt');
    expect(url.searchParams.get('assigneeId')).toBe('u1');
    expect(url.searchParams.get('status')).toBe('completed');
    client.clear();
  });
  it('передаёт только выбор, проверяет ответ и обновляет реестр и предпросмотр', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => [
          {
            externalId: '42',
            taskId: '11111111-1111-4111-8111-111111111111',
            outcome: 'created',
            reason: null,
          },
        ],
      });
    vi.stubGlobal('fetch', fetchMock);
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useMutationImportTasks('project'), { wrapper });
    await result.current.mutateAsync({ boardId: '11', externalIds: ['42'] });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project/tasks/import',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ boardId: '11', externalIds: ['42'] }),
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', 'project'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['task-import', 'project'] });
    client.clear();
  });
});
