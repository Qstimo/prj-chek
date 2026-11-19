import {
  DEFAULT_MAX_SEND_BYTES,
  DEFAULT_MAX_UPLOAD_BYTES,
  ProjectLifecycle,
  RECORDING_HEAD_BYTES,
  TranscriberKind,
  TranscriptionState,
  UPLOAD_TYPES,
  type TranscriberInfo,
  type TranscriptionJob,
} from '@cairn/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as hooks from '@/api/hooks';

import { SummariesScreen } from './SummariesScreen';

vi.mock('@/api/hooks');

const PROJECT = {
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'cairn',
  name: 'CAIRN',
  lifecycle: ProjectLifecycle.Active,
};

const ITEM = {
  id: '22222222-2222-2222-2222-222222222222',
  projectId: PROJECT.id,
  projectName: 'CAIRN',
  occurredOn: '2026-11-16',
  title: 'Созвон по релизу',
  taskCount: 0,
  archivedCount: 0,
  releasedCount: 0,
  isReleased: false,
  releasedVersionLabel: null,
  createdAt: '2026-11-16T10:00:00.000Z',
};

/** Настройки расшифровки: внешняя служба с извлечением. */
const TRANSCRIBER: TranscriberInfo = {
  isEnabled: true,
  kind: TranscriberKind.External,
  host: 'stt.api.cloud.yandex.net',
  model: 'general',
  maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES,
  maxSendBytes: DEFAULT_MAX_SEND_BYTES,
  canExtract: true,
  acceptedTypes: [...UPLOAD_TYPES],
  audioBitrate: '24k',
};

/** Задача расшифровки в работе. */
const JOB: TranscriptionJob = {
  id: '44444444-4444-4444-4444-444444444444',
  projectId: PROJECT.id,
  projectName: 'CAIRN',
  summaryId: null,
  occurredOn: '2026-11-17',
  title: 'Созвон по инциденту',
  state: TranscriptionState.Extracting,
  transcriber: TranscriberKind.External,
  model: 'general',
  host: 'stt.api.cloud.yandex.net',
  uploadBytes: 566_231_040,
  uploadType: 'video/mp4',
  audioBytes: null,
  audioType: null,
  hasRecording: true,
  failureCode: null,
  startedAt: '2026-11-17T10:00:00.000Z',
  sentAt: null,
  finishedAt: null,
};

/** Успешный query-результат для мока. */
function query<T>(data: T) {
  return { data, isPending: false, isError: false } as never;
}

/** Бездействующая мутация для мока. */
function mutation() {
  return { mutate: vi.fn(), isPending: false, error: null } as never;
}

/** Шпион `mutate` у подменённой мутации: мок объявлен как `never`. */
function mutateOf(stub: unknown): ReturnType<typeof vi.fn> {
  return (stub as { mutate: ReturnType<typeof vi.fn> }).mutate;
}

/** Файл с настоящей подписью mp4 в голове. */
function recordingFile(): File {
  const bytes = new Uint8Array(RECORDING_HEAD_BYTES);

  bytes.set([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);

  return new File([bytes], 'созвон.mp4');
}

beforeEach(() => {
  vi.mocked(hooks.useQuerySummaries).mockReturnValue(query([ITEM]));
  vi.mocked(hooks.useQuerySummaryTargets).mockReturnValue(query([PROJECT]));
  vi.mocked(hooks.useMutationCreateSummary).mockReturnValue(mutation());
  vi.mocked(hooks.useQueryTranscriptions).mockReturnValue(query([]));
  vi.mocked(hooks.useQueryTranscriber).mockReturnValue(query(TRANSCRIBER));
  vi.mocked(hooks.useMutationUploadRecording).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationCancelTranscription).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationDeleteTranscription).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationRetryTranscription).mockReturnValue(mutation());
});

describe('экран истории саммари', () => {
  it('показывает историю', () => {
    render(<SummariesScreen />);

    expect(screen.getByText('Созвон по релизу')).toBeInTheDocument();
  });

  it('«Новое саммари» открывает панель с формой', async () => {
    render(<SummariesScreen />);

    await userEvent.click(screen.getByRole('button', { name: 'Новое саммари' }));

    expect(screen.getByRole('dialog', { name: 'Новое саммари' })).toBeInTheDocument();
    expect(screen.getByLabelText('Проект')).toBeInTheDocument();
  });

  it('без целей кнопка создания объясняет, почему её нет смысла нажимать', async () => {
    // Вкладка видна всем: прятать её значило бы считать выдачи при
    // отрисовке навигации, а пустой экран ничего не раскрывает.
    vi.mocked(hooks.useQuerySummaryTargets).mockReturnValue(query([]));

    render(<SummariesScreen />);

    await userEvent.click(screen.getByRole('button', { name: 'Новое саммари' }));

    expect(screen.getByText(/писать хронику/)).toBeInTheDocument();
  });

  it('блок расшифровок стоит над историей, когда в нём есть строки', () => {
    vi.mocked(hooks.useQueryTranscriptions).mockReturnValue(query([JOB]));

    render(<SummariesScreen />);

    expect(screen.getByText('Расшифровки')).toBeInTheDocument();
    expect(screen.getByText('Созвон по инциденту')).toBeInTheDocument();
  });

  it('пустая очередь блока не рисует', () => {
    render(<SummariesScreen />);

    expect(screen.queryByText('Расшифровки')).not.toBeInTheDocument();
  });

  it('отказ ручки настроек не ломает экран, а убирает загрузку записи', async () => {
    // Очередь и настройки — не история: их отказ не повод показать
    // человеку экран ошибки вместо саммари.
    vi.mocked(hooks.useQueryTranscriber).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    } as never);

    render(<SummariesScreen />);

    await userEvent.click(screen.getByRole('button', { name: 'Новое саммари' }));

    expect(screen.getByLabelText('Проект')).toBeInTheDocument();
    expect(screen.queryByLabelText('Чем дать текст')).not.toBeInTheDocument();
  });

  it('отмена строки уходит с проектом этой строки', async () => {
    // Очередь сводная: отмена, посланная по чужому проекту, ответила бы
    // `404` — существование чужой задачи не раскрывается.
    const cancel = mutation();

    vi.mocked(hooks.useQueryTranscriptions).mockReturnValue(query([JOB]));
    vi.mocked(hooks.useMutationCancelTranscription).mockReturnValue(cancel);

    render(<SummariesScreen />);

    await userEvent.click(screen.getByRole('button', { name: 'Отменить' }));

    expect(mutateOf(cancel)).toHaveBeenCalledWith({
      projectId: PROJECT.id,
      jobId: JOB.id,
    });
  });

  it('загрузка записи уходит паспортом и записью, панель закрывается', async () => {
    const upload = mutation();

    vi.mocked(hooks.useMutationUploadRecording).mockReturnValue(upload);

    render(<SummariesScreen />);

    await userEvent.click(screen.getByRole('button', { name: 'Новое саммари' }));
    await userEvent.selectOptions(screen.getByLabelText('Чем дать текст'), 'Запись созвона');
    await userEvent.type(screen.getByLabelText('Заголовок'), 'Созвон по релизу');
    fireEvent.change(screen.getByLabelText('Загрузить запись'), {
      target: { files: [recordingFile()] },
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Загрузить запись/ })).toBeEnabled(),
    );

    await userEvent.click(screen.getByRole('button', { name: /Загрузить запись/ }));

    expect(mutateOf(upload)).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT.id,
        passport: { occurredOn: expect.any(String), title: 'Созвон по релизу' },
        recording: expect.objectContaining({ uploadType: 'video/mp4' }),
      }),
      expect.anything(),
    );
  });

  it('отказ загрузки истории не выглядит пустой историей', () => {
    vi.mocked(hooks.useQuerySummaries).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    } as never);

    render(<SummariesScreen />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
