import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMutationCreateVariable, useMutationRevealVariable } from './useMutationVariable';
import { useMutationExportEnv } from './useEnvTransfer';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const ENV_ID = '22222222-2222-2222-2222-222222222222';
const VAR_ID = '33333333-3333-3333-3333-333333333333';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('мутации переменных', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('создаёт переменную по адресу окружения', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: VAR_ID, key: 'KEY' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationCreateVariable(PROJECT_ID, ENV_ID), {
      wrapper,
    });

    result.current.mutate({ key: 'KEY', value: 'секрет' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/projects/${PROJECT_ID}/environments/${ENV_ID}/variables`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('раскрывает значение POST-запросом', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ value: 'секрет', versionNo: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationRevealVariable(PROJECT_ID, ENV_ID), {
      wrapper,
    });

    result.current.mutate(VAR_ID);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ value: 'секрет', versionNo: 1 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/projects/${PROJECT_ID}/environments/${ENV_ID}/variables/${VAR_ID}/reveal`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('выгрузка получает текст env', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'PORT=3000\n',
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationExportEnv(PROJECT_ID, ENV_ID), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe('PORT=3000\n');
  });

  it('сообщает об отказе в правах', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }),
    );

    const { result } = renderHook(() => useMutationRevealVariable(PROJECT_ID, ENV_ID), {
      wrapper,
    });

    result.current.mutate(VAR_ID);

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
