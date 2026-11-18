import {
  TRANSCRIPTION_EMPTY,
  TranscriberKind,
  TranscriptionState,
  type SummaryDetail,
  type TranscriptionJob,
} from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SummaryRecording } from './SummaryRecording';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const SUMMARY_ID = '22222222-2222-2222-2222-222222222222';
const SRC = `/api/projects/${PROJECT_ID}/summaries/${SUMMARY_ID}/recording`;

/** Саммари из видео: исходник убран при укладке текста. */
const FROM_VIDEO = {
  bytes: 11_534_336,
  mediaType: 'audio/ogg',
  uploadBytes: 566_231_040,
  uploadType: 'video/mp4',
  isSourceRemoved: true,
  uploadedAt: '2026-11-17T10:00:00.000Z',
};

/** Законченная расшифровка: повторить можно, ждать нечего. */
const DONE: TranscriptionJob = {
  id: '33333333-3333-3333-3333-333333333333',
  projectId: PROJECT_ID,
  projectName: 'CAIRN',
  summaryId: SUMMARY_ID,
  occurredOn: null,
  title: null,
  state: TranscriptionState.Done,
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
  finishedAt: '2026-11-17T10:12:00.000Z',
};

/** Блок записи с заданной записью и необязательной расшифровкой. */
function renderRecording(
  recording: SummaryDetail['recording'],
  transcription: TranscriptionJob | null = DONE,
): ReturnType<typeof vi.fn> {
  const retry = vi.fn();

  render(
    <SummaryRecording
      recording={recording}
      transcription={transcription}
      src={SRC}
      onRetry={retry}
      isRetrying={false}
    />,
  );

  return retry;
}

describe('запись созвона у саммари', () => {
  it('показывает плеер, размер дорожки и судьбу исходника', () => {
    // Человек загружал видео, а слушает звук, и экран говорит это прямо,
    // чтобы он не удивился (дизайн, 8.5). Плюс говорит, куда девался
    // загруженный файл: иначе на этот вопрос отвечать нечем, кроме кода.
    renderRecording(FROM_VIDEO);

    expect(screen.getByText(/дорожка 11 МБ/)).toBeInTheDocument();
    expect(screen.getByText(/загружено было видео 540 МБ/i)).toBeInTheDocument();
    expect(screen.getByText(/исходник убран после расшифровки/)).toBeInTheDocument();
    expect(screen.getByTestId('recording-audio')).toHaveAttribute('controls');
  });

  it('плеер играет дорожку с ручки саммари', () => {
    // Ручка отдаёт дорожку с поддержкой перемотки: переслушать спорное
    // место — это ровно про перемотку.
    renderRecording(FROM_VIDEO);

    expect(screen.getByTestId('recording-audio')).toHaveAttribute('src', SRC);
  });

  it('у саммари из mp3 про уборку не пишет: убирать было нечего', () => {
    // Исходник и дорожка — один файл, и «исходник убран» было бы
    // неправдой (дизайн, 3.3 следствие 3).
    renderRecording({
      bytes: 10_000_000,
      mediaType: 'audio/mpeg',
      uploadBytes: 10_000_000,
      uploadType: 'audio/mpeg',
      isSourceRemoved: false,
      uploadedAt: '2026-11-17T10:00:00.000Z',
    });

    expect(screen.getByText(/Запись созвона: 10 МБ/)).toBeInTheDocument();
    expect(screen.queryByText(/исходник/)).not.toBeInTheDocument();
  });

  it('у перекодированного аудио видео не поминается', () => {
    // Крупный mp3 тоже перекодируется, и «загружено было видео» было бы
    // неправдой о том, что человек своими руками загружал.
    renderRecording({
      bytes: 11_534_336,
      mediaType: 'audio/ogg',
      uploadBytes: 120_000_000,
      uploadType: 'audio/mpeg',
      isSourceRemoved: true,
      uploadedAt: '2026-11-17T10:00:00.000Z',
    });

    expect(screen.getByText(/загружено было аудио 114 МБ/i)).toBeInTheDocument();
    expect(screen.queryByText(/видео/)).not.toBeInTheDocument();
  });

  it('без записи вместо плеера объяснение', () => {
    renderRecording(null);

    expect(screen.getByText('Запись недоступна')).toBeInTheDocument();
    expect(screen.queryByTestId('recording-audio')).not.toBeInTheDocument();
  });

  it('без записи повторять нечего', () => {
    // Дорожки на томе нет, и ручка повтора ответила бы
    // `409 recording_missing`.
    renderRecording(null);

    expect(screen.queryByRole('button', { name: 'Расшифровать снова' })).not.toBeInTheDocument();
  });

  it('повторная расшифровка спрашивает подтверждение', async () => {
    // Кнопка перезаписывает ту самую колонку, которую человек правил.
    const retry = renderRecording(FROM_VIDEO);

    await userEvent.click(screen.getByRole('button', { name: 'Расшифровать снова' }));

    expect(screen.getByText(/Ваши правки текста пропадут/)).toBeInTheDocument();
    expect(retry).not.toHaveBeenCalled();
  });

  it('подтверждение называет и последствие для задач', async () => {
    renderRecording(FROM_VIDEO);

    await userEvent.click(screen.getByRole('button', { name: 'Расшифровать снова' }));

    expect(screen.getByText(/задачи будут помечены возможно устаревшими/)).toBeInTheDocument();
  });

  it('повтор начинается только после подтверждения', async () => {
    const retry = renderRecording(FROM_VIDEO);

    await userEvent.click(screen.getByRole('button', { name: 'Расшифровать снова' }));
    await userEvent.click(screen.getByRole('button', { name: 'Заменить текст' }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('пока расшифровка идёт, повторить нельзя, а состояние названо', () => {
    // Уникум в базе второй незакрытой расшифровки и не позволит: ручка
    // ответила бы `409`, и кнопка, которая всегда отказывает, хуже
    // отсутствующей.
    renderRecording(FROM_VIDEO, { ...DONE, state: TranscriptionState.Running });

    expect(screen.getByText(/Расшифровывается/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Расшифровать снова' })).not.toBeInTheDocument();
  });

  it('неудачная расшифровка названа причиной, а не состоянием', () => {
    renderRecording(FROM_VIDEO, {
      ...DONE,
      state: TranscriptionState.Failed,
      failureCode: TRANSCRIPTION_EMPTY,
    });

    expect(screen.getByText(/не распознано ни слова/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Расшифровать снова' })).toBeInTheDocument();
  });
});
