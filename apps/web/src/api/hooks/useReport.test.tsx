import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  useMutationPublishReport,
  useMutationUnpublishReport,
  useQueryReport,
  useQueryReportLink,
} from './useReport';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const VERSION_ID = '22222222-2222-2222-2222-222222222222';
const REPORT_PATH = `/api/projects/${PROJECT_ID}/roadmap/versions/${VERSION_ID}/report`;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('запросы отчёта по релизу', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('читает отчёт по адресу версии', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ markdown: '# Отчёт по релизу v1.0' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useQueryReport(PROJECT_ID, VERSION_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(REPORT_PATH);
  });

  it('отсутствие публикации — состояние экрана, а не ошибка', async () => {
    // Иначе непубликованный отчёт выглядел бы как сломанная загрузка:
    // у читающего без публикации ссылки просто нет.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }),
    );

    const { result } = renderHook(() => useQueryReportLink(PROJECT_ID, VERSION_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('нехватка прав на ссылку тоже не ошибка', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }),
    );

    const { result } = renderHook(() => useQueryReportLink(PROJECT_ID, VERSION_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('отказ сервера остаётся ошибкой', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );

    const { result } = renderHook(() => useQueryReportLink(PROJECT_ID, VERSION_ID), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('публикует отчёт версии', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ token: 'abc', url: 'https://cairn.local/roadmap/report/abc' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationPublishReport(PROJECT_ID, VERSION_ID), {
      wrapper,
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${REPORT_PATH}/public-link`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('снимает публикацию отчёта', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 204, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationUnpublishReport(PROJECT_ID, VERSION_ID), {
      wrapper,
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${REPORT_PATH}/public-link`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' });
  });
});
