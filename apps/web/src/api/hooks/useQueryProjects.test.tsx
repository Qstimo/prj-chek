import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useQueryProjects } from './useQueryProjects';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useQueryProjects', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('возвращает список проектов', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ id: '1', slug: 'proekt', name: 'Проект', lifecycle: 'active' }],
      }),
    );

    const { result } = renderHook(() => useQueryProjects(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });

  it('сообщает об ошибке', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );

    const { result } = renderHook(() => useQueryProjects(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('обращается к нужному адресу', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useQueryProjects(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/projects');
  });
});
