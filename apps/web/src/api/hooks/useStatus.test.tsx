import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMutationRunChecks } from './useStatus';

describe('ручной запуск проверок', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('сбрасывает и статусы, и инциденты', async () => {
    // Прогон меняет и то и другое: без сброса инцидентов индикатор
    // краснел, а «не отвечает с 14:20» оставалось от прошлого состояния.
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 202, json: async () => ({ ok: true }) }),
    );

    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }

    const { result } = renderHook(() => useMutationRunChecks(), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));

    expect(keys).toContain(JSON.stringify(['status']));
    expect(keys).toContain(JSON.stringify(['incidents']));
  });
});
