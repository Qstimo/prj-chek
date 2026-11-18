import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  useMutationCancelTranscription,
  useMutationDeleteTranscription,
  useMutationRetryTranscription,
  useMutationUploadRecording,
} from './useMutationTranscription';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const SUMMARY_ID = '22222222-2222-2222-2222-222222222222';
const JOB_ID = '33333333-3333-3333-3333-333333333333';

/** Запись, прошедшая проверки браузера. */
const RECORDING = {
  file: new File([new Uint8Array(8)], 'созвон.mp4'),
  uploadType: 'video/mp4',
  bytes: 8,
};

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Успешный ответ на любой `fetch`-запрос. */
function okFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

/** Подменённый `XMLHttpRequest`, отвечающий сразу и успешно. */
function okXhr(): { url?: string; headers: Record<string, string>; body?: unknown } {
  const seen: { url?: string; headers: Record<string, string>; body?: unknown } = { headers: {} };

  vi.stubGlobal(
    'XMLHttpRequest',
    class {
      readonly upload = { onprogress: null };

      status = 202;
      responseText = '{}';
      withCredentials = false;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;

      open(_method: string, url: string): void {
        seen.url = url;
      }

      setRequestHeader(name: string, value: string): void {
        seen.headers[name] = value;
      }

      send(body: unknown): void {
        seen.body = body;
        this.onload?.();
      }

      abort(): void {}
    },
  );

  return seen;
}

describe('мутации расшифровки', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('паспорт уходит строкой запроса, а тело — сырым файлом', async () => {
    // Телом едут сырые байты записи, и паспорту в нём места нет
    // (дизайн, 5.2). Имя файла не уходит никуда.
    const seen = okXhr();
    const { result } = renderHook(() => useMutationUploadRecording(), { wrapper });

    result.current.mutate({
      projectId: PROJECT_ID,
      passport: { occurredOn: '2026-11-17', title: 'Созвон по релизу' },
      recording: RECORDING,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(seen.url).toBe(
      `/api/projects/${PROJECT_ID}/summaries/transcriptions?occurredOn=2026-11-17&title=%D0%A1%D0%BE%D0%B7%D0%B2%D0%BE%D0%BD+%D0%BF%D0%BE+%D1%80%D0%B5%D0%BB%D0%B8%D0%B7%D1%83&uploadType=video%2Fmp4`,
    );
    expect(seen.body).toBe(RECORDING.file);
    expect(seen.headers['Content-Type']).toBe('video/mp4');
  });

  it('имя файла в адрес не попадает', async () => {
    // Имена файлов на машинах людей нередко говорят больше, чем
    // содержимое, и строка запроса — не место для них.
    const seen = okXhr();
    const { result } = renderHook(() => useMutationUploadRecording(), { wrapper });

    result.current.mutate({
      projectId: PROJECT_ID,
      passport: { occurredOn: '2026-11-17', title: 'Созвон' },
      recording: {
        ...RECORDING,
        file: new File([new Uint8Array(8)], 'Клиент Б, разбор инцидента.mp4'),
      },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(seen.url).not.toContain('%D0%9A%D0%BB%D0%B8%D0%B5%D0%BD%D1%82');
  });

  it('принятая запись обновляет очередь', async () => {
    okXhr();

    const { result } = renderHook(() => useMutationUploadRecording(), { wrapper });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    result.current.mutate({
      projectId: PROJECT_ID,
      passport: { occurredOn: '2026-11-17', title: 'Созвон' },
      recording: RECORDING,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey))).toContain(
      JSON.stringify(['transcriptions']),
    );
  });

  it('отмена идёт по адресу задачи своего проекта', async () => {
    // Очередь сводная, и проект у каждой строки свой: один `projectId` на
    // хук отправил бы отмену не туда.
    const fetchMock = okFetch();
    const { result } = renderHook(() => useMutationCancelTranscription(), { wrapper });

    result.current.mutate({ projectId: PROJECT_ID, jobId: JOB_ID });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/projects/${PROJECT_ID}/summaries/transcriptions/${JOB_ID}/cancel`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('удаление уносит задачу вместе с файлами', async () => {
    const fetchMock = okFetch();
    const { result } = renderHook(() => useMutationDeleteTranscription(), { wrapper });

    result.current.mutate({ projectId: PROJECT_ID, jobId: JOB_ID });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/projects/${PROJECT_ID}/summaries/transcriptions/${JOB_ID}`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' });
  });

  it('повтор идёт по адресу саммари: паспорт у него уже есть', async () => {
    const fetchMock = okFetch();
    const { result } = renderHook(() => useMutationRetryTranscription(), { wrapper });

    result.current.mutate({ projectId: PROJECT_ID, summaryId: SUMMARY_ID });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/projects/${PROJECT_ID}/summaries/${SUMMARY_ID}/transcriptions`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('повтор обновляет и очередь, и само саммари', async () => {
    // Состояние новой расшифровки видно и в очереди, и у саммари: это
    // одна и та же задача, прочитанная с двух сторон.
    okFetch();

    const { result } = renderHook(() => useMutationRetryTranscription(), { wrapper });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    result.current.mutate({ projectId: PROJECT_ID, summaryId: SUMMARY_ID });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));

    expect(keys).toContain(JSON.stringify(['transcriptions']));
    expect(keys).toContain(JSON.stringify(['summaries', PROJECT_ID, SUMMARY_ID]));
  });
});
