import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { STATUS_KEYS, useMutationRunChecks, useQueryProjectStatus } from './useStatus';

describe('ручной запуск проверок', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('forces one fresh GET after a stale false completion response without a false-to-false loop', async () => {
    let gets = 0;
    let backendCompleted = false;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    vi.stubGlobal('fetch', vi.fn(async () => {
      gets += 1;
      // The second request sampled old rows before an intervening run completed.
      if (gets === 2) backendCompleted = true;
      const body = { checkRunning: gets === 1, indicator: gets > 2 && backendCompleted ? 'ok' : 'unknown', domains: [], environments: [], warnings: [], registryWarnings: [] };
      return { ok: true, status: 200, json: async () => body };
    }));
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, unmount } = renderHook(() => useQueryProjectStatus('p'), { wrapper });
    await waitFor(() => expect(result.current.data?.checkRunning).toBe(true));
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.data?.indicator).toBe('ok'));
    expect(gets).toBe(3);
    expect(invalidate.mock.calls.filter(([options]) => JSON.stringify(options?.queryKey) === JSON.stringify(STATUS_KEYS.forProject('p')))).toHaveLength(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['incidents', 'p'] });
    vi.useFakeTimers();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(gets).toBe(3);
    unmount();
    client.clear();
  });

  it('refreshes after delayed POST acceptance even when an intervening GET already cleared optimistic running', async () => {
    let accept!: () => void;
    const accepted = new Promise<void>((resolve) => { accept = resolve; });
    let backendCompleted = false;
    let gets = 0;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        await accepted;
        return { ok: true, status: 202, json: async () => ({ accepted: true }) };
      }
      gets += 1;
      return { ok: true, status: 200, json: async () => ({ checkRunning: false, indicator: backendCompleted ? 'ok' : 'unknown', domains: [], environments: [], warnings: [], registryWarnings: [] }) };
    }));
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, unmount } = renderHook(() => ({ status: useQueryProjectStatus('p'), run: useMutationRunChecks() }), { wrapper });
    await waitFor(() => expect(result.current.status.isSuccess).toBe(true));
    act(() => result.current.run.mutate());
    await waitFor(() => expect(result.current.status.data?.checkRunning).toBe(true));
    await act(async () => { await result.current.status.refetch(); });
    await waitFor(() => expect(gets).toBe(3));
    expect(result.current.run.isPending).toBe(true);
    expect(result.current.status.data?.checkRunning).toBe(false);
    expect(result.current.status.data?.indicator).toBe('unknown');
    backendCompleted = true;
    act(() => accept());
    await waitFor(() => expect(result.current.run.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.status.data?.indicator).toBe('ok'));
    const completedGets = gets;
    vi.useFakeTimers();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(gets).toBe(completedGets);
    unmount();
    client.clear();
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

  it('reload discovers a running check, polls quickly and refreshes incidents on completion', async () => {
    let running = true;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ checkRunning: running, domains: [], environments: [], warnings: [], registryWarnings: [], indicator: 'ok' }) })));
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, unmount } = renderHook(() => useQueryProjectStatus('p'), { wrapper });
    await waitFor(() => expect(result.current.data?.checkRunning).toBe(true));
    running = false;
    await waitFor(() => expect(result.current.data?.checkRunning).toBe(false), { timeout: 4000 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['incidents', 'p'] });
    unmount();
    client.clear();
  });

  it.each(['accepted', 'busy', 'network'])('keeps running after %s until status confirms completion', async (outcome) => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    client.setQueryData(STATUS_KEYS.forProject('p'), { checkRunning: false });
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (outcome === 'network') throw new Error('offline');
      return { ok: outcome === 'accepted', status: outcome === 'accepted' ? 202 : 409, json: async () => ({ message: 'Проверки уже идут' }) };
    }));
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useMutationRunChecks(), { wrapper });
    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    expect(client.getQueryData(STATUS_KEYS.forProject('p'))).toMatchObject({ checkRunning: true });
    client.clear();
  });
});
