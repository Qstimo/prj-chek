import {
  EXTRACTION_FAILED,
  EXTRACTION_TIMED_OUT,
  RECORDING_BROKEN,
  RECORDING_CODEC_UNSUPPORTED,
  RECORDING_MISSING,
  RECORDING_NEEDS_FFMPEG,
  RECORDING_NO_AUDIO_TRACK,
  TRANSCRIBER_DISABLED,
  TRANSCRIBER_UNAVAILABLE,
  TRANSCRIPTION_CANCELLED,
  TRANSCRIPTION_EMPTY,
  TRANSCRIPTION_INTERRUPTED,
  TRANSCRIPTION_NO_ACCESS,
  TRANSCRIPTION_TIMED_OUT,
  TRANSCRIPTION_TOO_LARGE,
  TranscriberKind,
  TranscriptionState,
  type TranscriptionJob,
} from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FAILURE_MESSAGES } from './constants';
import { TranscriptionQueue } from './TranscriptionQueue';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const SUMMARY_ID = '22222222-2222-2222-2222-222222222222';
const JOB_ID = '33333333-3333-3333-3333-333333333333';

/** Задача расшифровки в работе: видео загружено, дорожка извлечена. */
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

/**
 * Все коды, которые API кладёт в `failure_code`.
 *
 * Список собран чтением API, а не списком контракта: там есть и коды,
 * которые приходят только ответом HTTP (`recording_not_audio`,
 * `recording_too_large`, `recording_type_not_accepted`,
 * `transcription_already_running`) и в строке задачи не оказываются
 * никогда. Источники: `job-decision.ts`, `prepare-decision.ts`,
 * `ffmpeg-failure.ts`, `transcription-runner.service.ts`,
 * `transcription.service.ts`.
 */
const STORED_FAILURE_CODES = [
  TRANSCRIBER_DISABLED,
  TRANSCRIBER_UNAVAILABLE,
  TRANSCRIPTION_CANCELLED,
  TRANSCRIPTION_EMPTY,
  TRANSCRIPTION_INTERRUPTED,
  TRANSCRIPTION_NO_ACCESS,
  TRANSCRIPTION_TIMED_OUT,
  TRANSCRIPTION_TOO_LARGE,
  RECORDING_BROKEN,
  RECORDING_CODEC_UNSUPPORTED,
  RECORDING_MISSING,
  RECORDING_NEEDS_FFMPEG,
  RECORDING_NO_AUDIO_TRACK,
  EXTRACTION_FAILED,
  EXTRACTION_TIMED_OUT,
];

/** Очередь с заданными строками и пустыми действиями. */
function renderQueue(jobs: TranscriptionJob[]): {
  cancel: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
} {
  const handlers = { cancel: vi.fn(), retry: vi.fn(), remove: vi.fn() };

  render(
    <TranscriptionQueue
      jobs={jobs}
      onCancel={handlers.cancel}
      onRetry={handlers.retry}
      onDelete={handlers.remove}
    />,
  );

  return handlers;
}

describe('очередь расшифровок', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Останавливает часы на шести с половиной минутах после приёма записи.
   *
   * Подменяется `Date.now`, а не таймеры: с фальшивыми таймерами
   * `userEvent` ждёт собственных задержек вечно, а здесь нужны ровно
   * фиксированные часы.
   */
  function freezeClock(): void {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-11-17T10:06:30.000Z').getTime());
  }

  it('блока нет, когда очередь пуста', () => {
    renderQueue([]);

    expect(screen.queryByText('Расшифровки')).not.toBeInTheDocument();
  });

  it('называет состояние словами, а не кодом', () => {
    renderQueue([{ ...JOB, state: TranscriptionState.Running }]);

    expect(screen.getByText(/Расшифровывается/)).toBeInTheDocument();
  });

  it('извлечение называется извлечением, а не «в очереди»', () => {
    // Главная причина, по которой состояние не слили с queued:
    // извлечение часового видео это минуты, и «В очереди» всё это время
    // было бы неправдой о том, чего человек ждёт.
    renderQueue([{ ...JOB, state: TranscriptionState.Extracting }]);

    expect(screen.getByText(/Извлекаем звуковую дорожку/)).toBeInTheDocument();
  });

  it('отправка названа отправкой дорожки, а не файла', () => {
    // Наружу уходит дорожка, и человек обязан прочитать это так.
    renderQueue([{ ...JOB, state: TranscriptionState.Sending }]);

    expect(screen.getByText(/Отправляем дорожку службе/)).toBeInTheDocument();
  });

  it('показывает время с начала, а не выдуманный процент', () => {
    // Процента у расшифровки нет и быть не может: `GET /operations/{id}`
    // отвечает «готово/не готово», и свой процент был бы враньём.
    freezeClock();
    renderQueue([{ ...JOB, state: TranscriptionState.Running }]);

    expect(screen.getByText('6 мин')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('показывает оба размера: что загрузили и что уйдёт', () => {
    // Единственное место, где человеку видно, что именно уйдёт наружу.
    renderQueue([{ ...JOB, uploadBytes: 566_231_040, audioBytes: 11_534_336 }]);

    expect(screen.getByText(/540 МБ → 11 МБ/)).toBeInTheDocument();
  });

  it('до извлечения показывает один размер: дорожки ещё нет', () => {
    renderQueue([{ ...JOB, state: TranscriptionState.Queued, audioBytes: null, audioType: null }]);

    expect(screen.getByText('540 МБ')).toBeInTheDocument();
  });

  it('у отправки отмены нет: байты уже в пути', () => {
    renderQueue([{ ...JOB, state: TranscriptionState.Sending }]);

    expect(screen.queryByRole('button', { name: 'Отменить' })).not.toBeInTheDocument();
  });

  it('у извлечения отмена есть и действительно прерывает работу', async () => {
    // Единственная отмена в системе, которая отменяет работу, а не
    // только закрывает строку.
    const handlers = renderQueue([{ ...JOB, state: TranscriptionState.Extracting }]);
    const button = screen.getByRole('button', { name: 'Отменить' });

    expect(button).toBeEnabled();

    await userEvent.click(button);

    expect(handlers.cancel).toHaveBeenCalledWith(
      expect.objectContaining({ id: JOB_ID, projectId: PROJECT_ID }),
    );
  });

  it('неудача называет причину и даёт повторить', () => {
    renderQueue([
      {
        ...JOB,
        summaryId: SUMMARY_ID,
        state: TranscriptionState.Failed,
        failureCode: TRANSCRIPTION_INTERRUPTED,
      },
    ]);

    expect(screen.getByText(/Передача прервана перезапуском/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Расшифровать снова' })).toBeInTheDocument();
  });

  it('у неудавшейся первой расшифровки повторять нечем', () => {
    // Повтор идёт по адресу саммари, а саммари ещё нет: ручки «повторить
    // задачу» в API не существует вовсе. Остаётся удалить и загрузить
    // заново, и фраза отказа говорит ровно это.
    renderQueue([
      {
        ...JOB,
        summaryId: null,
        state: TranscriptionState.Failed,
        failureCode: TRANSCRIBER_UNAVAILABLE,
      },
    ]);

    expect(screen.queryByRole('button', { name: 'Расшифровать снова' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Удалить' })).toBeInTheDocument();
  });

  it('удаление спрашивает подтверждение: исходник вернуть нечем', async () => {
    const handlers = renderQueue([
      { ...JOB, state: TranscriptionState.Failed, failureCode: EXTRACTION_FAILED },
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(handlers.remove).not.toHaveBeenCalled();
    expect(screen.getByText(/Загруженная запись будет удалена/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Удалить задачу' }));

    expect(handlers.remove).toHaveBeenCalledWith(expect.objectContaining({ id: JOB_ID }));
  });

  it.each([
    [RECORDING_NO_AUDIO_TRACK, /нет звука/],
    [RECORDING_BROKEN, /не читается/],
    [RECORDING_CODEC_UNSUPPORTED, /не умеем раскодировать/],
    [EXTRACTION_FAILED, /Не удалось извлечь/],
    [EXTRACTION_TIMED_OUT, /не завершилось/],
    [TRANSCRIPTION_TOO_LARGE, /слишком длинный/],
    [RECORDING_NEEDS_FFMPEG, /извлечение дорожки не настроено/],
  ])('%s объясняется своей фразой', (failureCode, phrase) => {
    // Три отказа извлечения человек разбирает по-разному: выгрузить
    // заново со звуком, выгрузить заново целиком, просто нажать «снова».
    // Один общий код «не вышло» отправил бы его делать не то.
    renderQueue([{ ...JOB, state: TranscriptionState.Failed, failureCode }]);

    expect(screen.getByText(phrase)).toBeInTheDocument();
  });

  it('три отказа извлечения говорят три разных дела', () => {
    // Сторож самого различия, а не фраз: совпади две фразы — и человек
    // пошёл бы выгружать заново то, что надо было просто повторить.
    const phrases = [RECORDING_NO_AUDIO_TRACK, RECORDING_BROKEN, EXTRACTION_FAILED].map(
      (code) => FAILURE_MESSAGES[code],
    );

    expect(new Set(phrases).size).toBe(3);
  });

  it('у каждого хранимого кода отказа есть русская фраза', () => {
    // Сторож полноты: код без фразы показался бы человеку сырым ключом
    // вида `recording_codec_unsupported`.
    const missing = STORED_FAILURE_CODES.filter((code) => !(code in FAILURE_MESSAGES));

    expect(missing).toEqual([]);
  });

  it('неизвестный код не прячет неудачу', () => {
    // Пропущенная фраза не должна прятать событие: исход назван, а код
    // показан как есть — это лучше пустой клетки.
    renderQueue([{ ...JOB, state: TranscriptionState.Failed, failureCode: 'что_то_новое' }]);

    expect(screen.getByText(/что_то_новое/)).toBeInTheDocument();
  });

  it('успешных в очереди нет: саммари уже в истории', () => {
    renderQueue([{ ...JOB, state: TranscriptionState.Done }]);

    expect(screen.queryByRole('row')).not.toBeInTheDocument();
  });

  it('повторная расшифровка названа повторной, а не пустой строкой', () => {
    // Паспорта у неё нет: он принадлежит записи хроники, и второй копии
    // не бывает. Пустая клетка читалась бы как «заголовок потеряли».
    renderQueue([{ ...JOB, summaryId: SUMMARY_ID, occurredOn: null, title: null }]);

    expect(screen.getByText('Повторная расшифровка')).toBeInTheDocument();
  });

  it('называет дату, заголовок и проект', () => {
    renderQueue([JOB]);

    expect(screen.getByText('Созвон по релизу')).toBeInTheDocument();
    expect(screen.getByText('CAIRN')).toBeInTheDocument();
    expect(screen.getByText('17.11.2026')).toBeInTheDocument();
  });
});
