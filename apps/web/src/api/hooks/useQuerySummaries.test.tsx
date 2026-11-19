import {
  SummaryTaskOrigin,
  SummaryTaskState,
  TranscriberKind,
  TranscriptionState,
  type SummaryDetail,
} from '@cairn/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SUMMARY_POLL_MS, summaryPollIntervalOf, useQuerySummary } from './useQuerySummaries';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const SUMMARY_ID = '22222222-2222-2222-2222-222222222222';

/** Саммари, набранное руками: записи созвона у него нет вовсе. */
const TEXT_ONLY: SummaryDetail = {
  id: SUMMARY_ID,
  projectId: PROJECT_ID,
  projectName: 'CAIRN',
  occurredOn: '2026-11-17',
  title: 'Созвон по релизу',
  taskCount: 1,
  archivedCount: 0,
  releasedCount: 0,
  isReleased: false,
  releasedVersionLabel: null,
  createdAt: '2026-11-17T10:00:00.000Z',
  chronicleEntryId: '33333333-3333-3333-3333-333333333333',
  text: 'обсудили сроки',
  tasks: [
    {
      id: '44444444-4444-4444-4444-444444444444',
      title: 'Сделать',
      position: 1,
      origin: SummaryTaskOrigin.Human,
      url: null,
      platformIds: [],
      state: SummaryTaskState.Active,
      releasedVersionId: null,
      releasedVersionLabel: null,
    },
  ],
  suggester: null,
  releasedVersionId: null,
  isTextStale: false,
  suggestedVersionLabel: 'v1.3',
  platforms: [],
  recording: null,
  transcription: null,
};

/** То же саммари с расшифровкой в заданном состоянии. */
function withTranscription(state: TranscriptionState): SummaryDetail {
  return {
    ...TEXT_ONLY,
    recording: {
      bytes: 11_534_336,
      mediaType: 'audio/ogg',
      uploadBytes: 566_231_040,
      uploadType: 'video/mp4',
      isSourceRemoved: false,
      uploadedAt: '2026-11-17T10:00:00.000Z',
    },
    transcription: {
      id: '55555555-5555-5555-5555-555555555555',
      projectId: PROJECT_ID,
      projectName: 'CAIRN',
      summaryId: SUMMARY_ID,
      occurredOn: null,
      title: null,
      state,
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
      sentAt: null,
      finishedAt: null,
    },
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Деталь саммари в ответ на любое обращение. */
function stubDetail(detail: SummaryDetail): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() =>
      Promise.resolve({ ok: true, status: 200, json: async () => detail }),
    ),
  );
}

describe('опрос детали саммари', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('перезапрашивает деталь, пока расшифровка не закончена', () => {
    // Состояние обработки видно на самом экране саммари, без перехода в
    // список: прогон идёт раз в двадцать секунд, и чаще спрашивать не о
    // чем (дизайн, 4.2).
    expect(summaryPollIntervalOf(withTranscription(TranscriptionState.Running))).toBe(
      SUMMARY_POLL_MS,
    );
    expect(SUMMARY_POLL_MS).toBe(10_000);
  });

  it.each([
    TranscriptionState.Queued,
    TranscriptionState.Extracting,
    TranscriptionState.Sending,
  ])('незакрытое состояние %s тоже перезапрашивается', (state) => {
    expect(summaryPollIntervalOf(withTranscription(state))).toBe(SUMMARY_POLL_MS);
  });

  it.each([TranscriptionState.Done, TranscriptionState.Failed])(
    'закончившаяся расшифровка (%s) опрос прекращает',
    (state) => {
      // Вечный таймер на экране, где ничего не меняется, гоняет базу без
      // повода. У неудачи своего хода нет — её двигает человек кнопкой
      // «Расшифровать снова».
      expect(summaryPollIntervalOf(withTranscription(state))).toBe(false);
    },
  );

  it('саммари без расшифровки и неизвестное не опрашиваются', () => {
    // Текст вставили руками: ждать нечего и спрашивать незачем.
    expect(summaryPollIntervalOf(TEXT_ONLY)).toBe(false);
    expect(summaryPollIntervalOf(undefined)).toBe(false);
  });

  it('пауза и правда доходит до запроса, пока расшифровка идёт', async () => {
    // Чистой функции мало: не переданная в `useQuery` пауза оставила бы
    // экран, который рассказывает про шаг расшифровки и не обновляется.
    vi.useFakeTimers();
    stubDetail(withTranscription(TranscriptionState.Running));

    const { result } = renderHook(() => useQuerySummary(PROJECT_ID, SUMMARY_ID), { wrapper });

    await vi.waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(SUMMARY_POLL_MS);

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it('у законченной расшифровки опрос не идёт вовсе', async () => {
    vi.useFakeTimers();
    stubDetail(withTranscription(TranscriptionState.Done));

    const { result } = renderHook(() => useQuerySummary(PROJECT_ID, SUMMARY_ID), { wrapper });

    await vi.waitFor(() => expect(result.current.isSuccess).toBe(true));
    await vi.advanceTimersByTimeAsync(SUMMARY_POLL_MS * 3);

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('пока проект неизвестен, запрос не идёт', async () => {
    // Ручка детали живёт под проектом, и адреса без него не бывает.
    stubDetail(TEXT_ONLY);

    renderHook(() => useQuerySummary(undefined, SUMMARY_ID), { wrapper });

    await waitFor(() => expect(vi.mocked(fetch)).not.toHaveBeenCalled());
  });
});
