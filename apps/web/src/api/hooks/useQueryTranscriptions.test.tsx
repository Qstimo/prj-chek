import { TranscriberKind, TranscriptionState, type TranscriptionJob } from '@cairn/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  TRANSCRIPTION_POLL_MS,
  pollIntervalOf,
  useQueryTranscriptions,
} from './useQueryTranscriptions';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const JOB_ID = '22222222-2222-2222-2222-222222222222';

/** Задача расшифровки, какой её отдаёт очередь. */
const JOB: TranscriptionJob = {
  id: JOB_ID,
  projectId: PROJECT_ID,
  projectName: 'CAIRN',
  summaryId: null,
  occurredOn: '2026-11-17',
  title: 'Созвон по релизу',
  state: TranscriptionState.Running,
  transcriber: TranscriberKind.External,
  model: 'general',
  host: 'stt.api.cloud.yandex.net',
  uploadBytes: 566_231_040,
  uploadType: 'video/mp4',
  audioBytes: 11_534_336,
  audioType: 'audio/ogg',
  hasRecording: true,
  failureCode: null,
  startedAt: '2026-11-17T10:00:00.000Z',
  sentAt: '2026-11-17T10:04:12.000Z',
  finishedAt: null,
};

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Ответы очереди по порядку обращений. */
function stubQueue(...answers: TranscriptionJob[][]): void {
  let call = 0;

  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => {
      const body = answers[Math.min(call, answers.length - 1)] ?? [];

      call += 1;

      return Promise.resolve({ ok: true, status: 200, json: async () => body });
    }),
  );
}

describe('опрос очереди расшифровок', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('опрашивает очередь, пока в ней есть незакрытые', () => {
    // Прогон идёт раз в двадцать секунд, и чаще спрашивать не о чем.
    expect(pollIntervalOf([JOB])).toBe(TRANSCRIPTION_POLL_MS);
    expect(TRANSCRIPTION_POLL_MS).toBe(10_000);
  });

  it.each([TranscriptionState.Queued, TranscriptionState.Extracting, TranscriptionState.Sending])(
    'незакрытое состояние %s тоже опрашивается',
    (state) => {
      expect(pollIntervalOf([{ ...JOB, state }])).toBe(TRANSCRIPTION_POLL_MS);
    },
  );

  it('перестаёт опрашивать, когда незакрытых не осталось', () => {
    // Иначе открытая вкладка стучала бы в API вечно: у неудачи своего
    // хода нет, её двигает человек.
    expect(pollIntervalOf([{ ...JOB, state: TranscriptionState.Failed }])).toBe(false);
  });

  it('пустую и неизвестную очередь не опрашивает', () => {
    expect(pollIntervalOf([])).toBe(false);
    expect(pollIntervalOf(undefined)).toBe(false);
  });

  it('спрашивает сводную ручку, а не проектную', async () => {
    // Вкладка сводная по всем проектам, куда можно писать хронику.
    stubQueue([JOB]);

    const { result } = renderHook(() => useQueryTranscriptions(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/api/summaries/transcriptions');
  });

  it('исчезнувшая из очереди строка перечитывает историю саммари', async () => {
    // Строка уходит из очереди ровно тогда, когда расшифровка кончилась
    // успехом: `done` в очередь не попадает, а в истории появилось
    // саммари. Без этого человек видел бы пустую очередь и пустую
    // историю до перезагрузки страницы (дизайн, 8.3).
    stubQueue([JOB], []);

    const { result } = renderHook(() => useQueryTranscriptions(), { wrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(1));

    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await result.current.refetch();

    await waitFor(() =>
      expect(invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey))).toContain(
        JSON.stringify(['summaries']),
      ),
    );
  });

  it('неизменная очередь историю не перечитывает', async () => {
    // Иначе каждый тик опроса сбрасывал бы историю саммари — то есть
    // каждые десять секунд перезапрашивал бы то, что не менялось.
    stubQueue([JOB], [JOB]);

    const { result } = renderHook(() => useQueryTranscriptions(), { wrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(1));

    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await result.current.refetch();

    expect(invalidate).not.toHaveBeenCalled();
  });
});
