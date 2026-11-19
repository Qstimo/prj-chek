import {
  AccessLevel,
  PlatformKind,
  RoadmapVersionState,
  SUGGESTER_UNAVAILABLE,
  Section,
  SummaryTaskOrigin,
  SummaryTaskState,
  ModelServicePlacement,
  TranscriberKind,
  TranscriptionState,
  type SummaryDetail,
  type TaskSuggesterInfo,
} from '@cairn/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/api';
import * as hooks from '@/api/hooks';

import { SummaryScreen } from './SummaryScreen';

vi.mock('@/api/hooks');

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const SUMMARY_ID = '22222222-2222-2222-2222-222222222222';
const TASK_ID = '33333333-3333-3333-3333-333333333333';
const VERSION_ID = '44444444-4444-4444-4444-444444444444';

const API = {
  id: '66666666-6666-6666-6666-666666666666',
  kind: PlatformKind.Server,
  name: 'API',
  position: 1,
};

const LIST_ITEM = {
  id: SUMMARY_ID,
  projectId: PROJECT_ID,
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

const TEXT_ONLY: SummaryDetail = {
  ...LIST_ITEM,
  chronicleEntryId: '55555555-5555-5555-5555-555555555555',
  text: 'обсудили сроки',
  tasks: [],
  suggester: null,
  releasedVersionId: null,
  isTextStale: false,
  suggestedVersionLabel: 'v1.3',
  platforms: [],
  /** Текст вставили руками: записи созвона у такого саммари нет вовсе. */
  recording: null,
  transcription: null,
};

const WITH_TASKS: SummaryDetail = {
  ...TEXT_ONLY,
  taskCount: 1,
  archivedCount: 0,
  releasedCount: 0,
  tasks: [
    { id: TASK_ID, title: 'Сделать', position: 1, origin: SummaryTaskOrigin.Model, state: SummaryTaskState.Active, releasedVersionId: null, releasedVersionLabel: null, url: null, platformIds: [] },
  ],
  suggester: { name: 'external', model: 'gpt-4o-mini', at: '2026-11-16T10:00:00.000Z', dropped: 0 },
};

/** Саммари, родившееся из записи созвона: исходник убран на `done`. */
const FROM_RECORDING: SummaryDetail = {
  ...TEXT_ONLY,
  recording: {
    bytes: 11_534_336,
    mediaType: 'audio/ogg',
    uploadBytes: 566_231_040,
    uploadType: 'video/mp4',
    isSourceRemoved: true,
    uploadedAt: '2026-11-17T10:00:00.000Z',
  },
  transcription: {
    id: '77777777-7777-7777-7777-777777777777',
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
  },
};

const RELEASED_DETAIL: SummaryDetail = {
  ...WITH_TASKS,
  isReleased: true,
  releasedVersionLabel: 'v1.4',
  releasedVersionId: VERSION_ID,
};

const EXTERNAL_SUGGESTER: TaskSuggesterInfo = {
  isEnabled: true,
  placement: ModelServicePlacement.External,
  host: 'api.openai.com',
  model: 'gpt-4o-mini',
  maxChars: 40_000,
};

const LOCAL_SUGGESTER: TaskSuggesterInfo = {
  isEnabled: true,
  placement: ModelServicePlacement.Local,
  host: 'llm.internal',
  model: 'qwen2.5',
  maxChars: 40_000,
};

const DISABLED_SUGGESTER: TaskSuggesterInfo = {
  isEnabled: false,
  placement: ModelServicePlacement.External,
  host: null,
  model: null,
  maxChars: 40_000,
};

/** Успешный query-результат для мока. */
function query<T>(data: T) {
  return { data, isPending: false, isError: false } as never;
}

/** Бездействующая мутация для мока. */
function mutation() {
  return { mutate: vi.fn(), isPending: false, error: null } as never;
}

/** Мутация в полёте: её ждёт бирка состояния в шапке. */
function pending() {
  return { mutate: vi.fn(), isPending: true, error: null } as never;
}

/** Шпион `mutate` у подменённой мутации: мок объявлен как `never`. */
function mutateOf(stub: unknown): ReturnType<typeof vi.fn> {
  return (stub as { mutate: ReturnType<typeof vi.fn> }).mutate;
}

/** Мутация, уже вернувшая отказ с кодом из контракта. */
function failed(code: string, extra: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    isPending: false,
    error: new ApiError(502, 'ответ сервера', { code, ...extra }),
  } as never;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Экран с заданными деталью и настройками предложителя. */
function renderScreen(detail: SummaryDetail, suggester: TaskSuggesterInfo) {
  vi.mocked(hooks.useQuerySummary).mockReturnValue(query(detail));
  vi.mocked(hooks.useQuerySummaries).mockReturnValue(query([{ ...LIST_ITEM, ...detail }]));
  vi.mocked(hooks.useQueryTaskSuggester).mockReturnValue(query(suggester));

  return render(<SummaryScreen summaryId={SUMMARY_ID} />, { wrapper });
}

beforeEach(() => {
  vi.mocked(hooks.useQuerySections).mockReturnValue(
    query({ [Section.Chronicle]: AccessLevel.Write, [Section.Roadmap]: AccessLevel.Write }),
  );
  vi.mocked(hooks.useQueryPublicLink).mockReturnValue(query(null));
  vi.mocked(hooks.useMutationSuggestSummaryTasks).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationSaveSummaryTasks).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationReleaseSummary).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationUpdateChronicleEntry).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationRetryTranscription).mockReturnValue(mutation());
});

describe('экран саммари', () => {
  it('подпись о передаче видна до нажатия кнопки', () => {
    // Постоянная, не всплывающая: она говорит правду до нажатия и
    // заменяет диалог подтверждения на каждый вызов.
    renderScreen(TEXT_ONLY, EXTERNAL_SUGGESTER);

    expect(screen.getByText(/api\.openai\.com/)).toBeInTheDocument();
    expect(screen.getByText(/gpt-4o-mini/)).toBeInTheDocument();
    expect(screen.getByText(/уходит на этот адрес/)).toBeInTheDocument();
  });

  it('локальный предложитель говорит про контур', () => {
    renderScreen(TEXT_ONLY, LOCAL_SUGGESTER);

    expect(screen.getByText(/в вашем контуре/)).toBeInTheDocument();
  });

  it('выключенный предложитель объясняет, а не предлагает повтор', () => {
    renderScreen(TEXT_ONLY, DISABLED_SUGGESTER);

    expect(screen.getByRole('button', { name: /Создать задачи/ })).toBeDisabled();
    expect(screen.getByText(/не настроена/)).toBeInTheDocument();
  });

  it('при выключенном предложителе задачи всё равно набираются руками', () => {
    // Установка без модели обязана оставаться полностью рабочей.
    renderScreen(TEXT_ONLY, DISABLED_SUGGESTER);

    expect(screen.getByRole('button', { name: /Добавить задачу/ })).toBeEnabled();
  });

  it('повторная разбивка непустого черновика спрашивает подтверждение', async () => {
    // Заменять правленный список молча нельзя. Сторож стоит у дорогой
    // стороны: платный вызов не должен уйти, пока диалог открыт, — само
    // наличие диалога этого не доказывает.
    const suggest = mutation();
    vi.mocked(hooks.useMutationSuggestSummaryTasks).mockReturnValue(suggest);
    renderScreen(WITH_TASKS, LOCAL_SUGGESTER);

    await userEvent.click(screen.getByRole('button', { name: /Создать задачи/ }));

    expect(
      (suggest as unknown as { mutate: ReturnType<typeof vi.fn> }).mutate,
    ).not.toHaveBeenCalled();
    expect(screen.getByText(/будет заменён/)).toBeInTheDocument();
  });

  it('подтверждение повторной разбивки называет потерю ссылок и тегов', async () => {
    // Диалог, обещающий меньше, чем делает, хуже отсутствия диалога:
    // повторная разбивка уносит теперь и проставленные ссылки с
    // тегами, а не только формулировки (дизайн, 7.4).
    renderScreen({ ...WITH_TASKS, platforms: [API] }, LOCAL_SUGGESTER);

    await userEvent.click(screen.getByRole('button', { name: /Создать задачи/ }));

    expect(screen.getByText(/ссылки и теги/i)).toBeInTheDocument();
  });

  it('чипы платформ приходят из детали саммари', () => {
    // Один запрос и один гейт: платформы едут тем же ответом, что
    // обозначение версии-получателя (дизайн, 3.2).
    renderScreen({ ...WITH_TASKS, platforms: [API] }, LOCAL_SUGGESTER);

    expect(screen.getByRole('checkbox', { name: 'API' })).toBeInTheDocument();
  });

  it('без платформ в детали чипов на экране нет', () => {
    // Неотличимо от проекта без платформ — это и есть нераскрытие.
    renderScreen(WITH_TASKS, LOCAL_SUGGESTER);

    expect(screen.queryByRole('group', { name: 'Платформы' })).not.toBeInTheDocument();
  });

  it('подтверждение отпускает разбивку', async () => {
    // Обратная сторона: диалог не должен стать тупиком.
    const suggest = mutation();
    vi.mocked(hooks.useMutationSuggestSummaryTasks).mockReturnValue(suggest);
    renderScreen(WITH_TASKS, LOCAL_SUGGESTER);

    await userEvent.click(screen.getByRole('button', { name: /Создать задачи/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Заменить' }));

    expect((suggest as unknown as { mutate: ReturnType<typeof vi.fn> }).mutate).toHaveBeenCalled();
  });

  it('первая разбивка пустого черновика подтверждения не спрашивает', async () => {
    const suggest = mutation();
    vi.mocked(hooks.useMutationSuggestSummaryTasks).mockReturnValue(suggest);
    renderScreen(TEXT_ONLY, LOCAL_SUGGESTER);

    await userEvent.click(screen.getByRole('button', { name: /Создать задачи/ }));

    expect(screen.queryByText(/будет заменён/)).not.toBeInTheDocument();
    expect((suggest as unknown as { mutate: ReturnType<typeof vi.fn> }).mutate).toHaveBeenCalled();
  });

  it('отказ разбивки объясняет по коду', () => {
    // «И не очищает список» здесь не проверялось: список рисуется из
    // замоканного запроса, на который состояние ошибки мутации не
    // влияет. Настоящая проверка этого свойства стоит на сервере —
    // `summaries.service.test.ts`, «отказ оставляет прежний черновик».
    vi.mocked(hooks.useMutationSuggestSummaryTasks).mockReturnValue(failed(SUGGESTER_UNAVAILABLE));

    renderScreen(WITH_TASKS, LOCAL_SUGGESTER);

    expect(screen.getByText(/не ответила/)).toBeInTheDocument();
  });

  it('платформы проекта экран не запрашивает', () => {
    // Чтобы узнать, есть ли у проекта платформы, нужен уровень на
    // «Инфо», которого у субъекта этого потока может не быть вовсе:
    // экран, спросивший платформы, завёл бы у двух заявленных прав
    // скрытое третье требование (дизайн, раздел 7.5).
    renderScreen(WITH_TASKS, LOCAL_SUGGESTER);

    expect(vi.mocked(hooks.useQueryPlatforms)).not.toHaveBeenCalled();
  });

  it('предел объёма называет настоящее число', () => {
    vi.mocked(hooks.useMutationSuggestSummaryTasks).mockReturnValue(
      failed('summary_text_too_long', { maxChars: 40_000 }),
    );

    renderScreen(TEXT_ONLY, LOCAL_SUGGESTER);

    expect(screen.getByText(/40 000/)).toBeInTheDocument();
  });

  it('число отброшенных предложений называется', () => {
    // Урезанный список без такой подписи читается как «столько и
    // предложили».
    renderScreen(
      { ...WITH_TASKS, suggester: { ...WITH_TASKS.suggester!, dropped: 4 } },
      LOCAL_SUGGESTER,
    );

    expect(screen.getByText(/Отброшено предложений модели: 4/)).toBeInTheDocument();
  });

  it('у прежних разбивок число отброшенных не выдумывается', () => {
    // `null` значит «не сохранено»: показать ноль было бы утверждением.
    renderScreen(
      { ...WITH_TASKS, suggester: { ...WITH_TASKS.suggester!, dropped: null } },
      LOCAL_SUGGESTER,
    );

    expect(screen.queryByText(/Отброшено предложений/)).not.toBeInTheDocument();
  });

  it('ноль отброшенных не показывается', () => {
    renderScreen(WITH_TASKS, LOCAL_SUGGESTER);

    expect(screen.queryByText(/Отброшено предложений/)).not.toBeInTheDocument();
  });

  it('устаревший текст предупреждает, но релиз не блокирует', () => {
    // Судит человек: он видит и текст, и задачи.
    renderScreen({ ...WITH_TASKS, isTextStale: true }, LOCAL_SUGGESTER);

    expect(screen.getByText(/задачи могли устареть/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Сформировать релиз/ })).toBeEnabled();
  });

  it('без права на роадмап кнопка релиза выключена с объяснением', () => {
    vi.mocked(hooks.useQuerySections).mockReturnValue(
      query({ [Section.Chronicle]: AccessLevel.Write }),
    );

    renderScreen(WITH_TASKS, LOCAL_SUGGESTER);

    expect(screen.getByRole('button', { name: /Сформировать релиз/ })).toBeDisabled();
    expect(screen.getByText(/Нет права на «Роадмап»/)).toBeInTheDocument();
  });

  it('уровень роадмапа ниже записи называется своей причиной', () => {
    // Роадмап он видит, и «нет права» прочиталось бы как ошибка системы:
    // ручка ответит ему `403`, а не `404` (дизайн, раздел 1.4).
    vi.mocked(hooks.useQuerySections).mockReturnValue(
      query({ [Section.Chronicle]: AccessLevel.Write, [Section.Roadmap]: AccessLevel.Read }),
    );

    renderScreen(WITH_TASKS, LOCAL_SUGGESTER);

    expect(screen.getByRole('button', { name: /Сформировать релиз/ })).toBeDisabled();
    expect(screen.getByText(/ниже записи/)).toBeInTheDocument();
    expect(screen.queryByText(/Нет права на «Роадмап»/)).not.toBeInTheDocument();
  });

  it('пустой черновик релиз формировать не даёт', () => {
    renderScreen(TEXT_ONLY, LOCAL_SUGGESTER);

    expect(screen.getByRole('button', { name: /Сформировать релиз/ })).toBeDisabled();
  });

  it('после релиза шаги 2 и 3 исчезают, остаётся ссылка на версию', () => {
    renderScreen(RELEASED_DETAIL, LOCAL_SUGGESTER);

    expect(screen.queryByRole('button', { name: /Создать задачи/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Сформировать релиз/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /v1\.4/ })).toHaveAttribute(
      'href',
      `/projects/${PROJECT_ID}/roadmap?version=${VERSION_ID}`,
    );
  });

  it('формулировки выводятся текстом, а не разметкой', () => {
    // Вывод модели недоверен: никакого Markdown и
    // dangerouslySetInnerHTML.
    renderScreen(
      {
        ...WITH_TASKS,
        tasks: [
          {
            id: TASK_ID,
            title: '<b>жирно</b>',
            position: 1,
            origin: SummaryTaskOrigin.Model,
            state: SummaryTaskState.Active,
            releasedVersionId: null,
            releasedVersionLabel: null,
            url: null,
            platformIds: [],
          },
        ],
      },
      LOCAL_SUGGESTER,
    );

    expect(screen.getByDisplayValue('<b>жирно</b>')).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
  });

  it('форма релиза предзаполнена подсказкой обозначения', async () => {
    renderScreen(WITH_TASKS, LOCAL_SUGGESTER);

    await userEvent.click(screen.getByRole('button', { name: /Сформировать релиз/ }));

    expect(screen.getByLabelText(/Обозначение/)).toHaveValue('v1.3');
    expect(screen.queryByLabelText(/Дата релиза/)).not.toBeInTheDocument();
  });

  it('опубликованный роадмап предупреждает о публичной выдаче', async () => {
    vi.mocked(hooks.useQueryPublicLink).mockReturnValue(query({ token: 'abc', url: '/roadmap/abc' }));

    renderScreen(WITH_TASKS, LOCAL_SUGGESTER);

    await userEvent.click(screen.getByRole('button', { name: /Сформировать релиз/ }));

    expect(screen.getByText(/публичную выдачу/)).toBeInTheDocument();
  });

  it('релиз отправляет задачи и три поля новой версии', async () => {
    const release = mutation();
    vi.mocked(hooks.useMutationReleaseSummary).mockReturnValue(release);
    renderScreen(WITH_TASKS, LOCAL_SUGGESTER);

    await userEvent.click(screen.getByRole('button', { name: /Сформировать релиз/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Сформировать релиз' }));

    const mutate = (release as unknown as { mutate: ReturnType<typeof vi.fn> }).mutate;

    expect(mutate.mock.calls[0]?.[0]).toEqual({
      taskIds: [TASK_ID],
      target: {
        kind: 'new',
        version: {
          label: 'v1.3',
          state: RoadmapVersionState.Planned,
          plannedDate: expect.any(String),
        },
      },
    });
  });

  it('несохранённые правки черновика релиз не пропускают', async () => {
    // Сервер читает черновик из базы: релиз с правкой, оставшейся в
    // памяти, уехал бы со старой формулировкой. Исправить это было бы
    // уже нечем — после релиза `PUT …/tasks` отвечает `409`, а редактор
    // становится только для чтения.
    const release = mutation();
    vi.mocked(hooks.useMutationReleaseSummary).mockReturnValue(release);
    renderScreen(WITH_TASKS, LOCAL_SUGGESTER);

    await userEvent.type(screen.getByLabelText('Формулировка задачи'), ' быстрее');
    await userEvent.click(screen.getByRole('button', { name: /Сформировать релиз/ }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      (release as unknown as { mutate: ReturnType<typeof vi.fn> }).mutate,
    ).not.toHaveBeenCalled();
    expect(screen.getByText(/Сначала сохраните правки/)).toBeInTheDocument();
  });

  it('сохранённый черновик релиз пропускает', async () => {
    // Обратная сторона: выключает кнопку именно несохранённое, а не сам
    // факт непустого черновика.
    renderScreen(WITH_TASKS, LOCAL_SUGGESTER);

    await userEvent.click(screen.getByRole('button', { name: /Сформировать релиз/ }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText(/Сначала сохраните правки/)).not.toBeInTheDocument();
  });

  it('уход со страницы с несохранёнными правками предупреждает', async () => {
    // Закладку, обновление и закрытие вкладки своим диалогом не
    // перехватить: предупреждает браузер по `preventDefault`.
    renderScreen(WITH_TASKS, LOCAL_SUGGESTER);

    await userEvent.type(screen.getByLabelText('Формулировка задачи'), ' быстрее');
    const leaving = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leaving);

    expect(leaving.defaultPrevented).toBe(true);
  });

  it('уход со страницы без правок не предупреждает', () => {
    // Иначе предупреждение теряет смысл: его перестают читать.
    renderScreen(WITH_TASKS, LOCAL_SUGGESTER);

    const leaving = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leaving);

    expect(leaving.defaultPrevented).toBe(false);
  });

  it('правка текста открывает панель с полями записи хроники', async () => {
    renderScreen(TEXT_ONLY, LOCAL_SUGGESTER);

    await userEvent.click(screen.getByRole('button', { name: 'Править' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Содержимое')).toHaveValue('обсудили сроки');
  });

  it('у саммари из записи есть плеер дорожки', () => {
    // Человек загружал видео, а слушает звук: ручка отдаёт дорожку.
    renderScreen(FROM_RECORDING, LOCAL_SUGGESTER);

    expect(screen.getByTestId('recording-audio')).toHaveAttribute(
      'src',
      `/api/projects/${PROJECT_ID}/summaries/${SUMMARY_ID}/recording`,
    );
    expect(screen.getByText(/дорожка 11 МБ/)).toBeInTheDocument();
  });

  it('у набранного руками саммари блока записи нет вовсе', () => {
    // «Запись недоступна» у текста, который никто не записывал, было бы
    // рассказом о записи, которой не существовало.
    renderScreen(TEXT_ONLY, LOCAL_SUGGESTER);

    expect(screen.queryByText('Запись')).not.toBeInTheDocument();
    expect(screen.queryByText('Запись недоступна')).not.toBeInTheDocument();
  });

  it('повторная расшифровка уходит после подтверждения', async () => {
    const retry = mutation();

    vi.mocked(hooks.useMutationRetryTranscription).mockReturnValue(retry);
    renderScreen(FROM_RECORDING, LOCAL_SUGGESTER);

    await userEvent.click(screen.getByRole('button', { name: 'Расшифровать снова' }));
    await userEvent.click(screen.getByRole('button', { name: 'Заменить текст' }));

    expect(mutateOf(retry)).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      summaryId: SUMMARY_ID,
    });
  });

  it('шапка называет проект, дату и заголовок саммари', () => {
    // Колонки прокручиваются каждая своим содержимым, и человек,
    // уехавший к концу списка задач, обязан видеть, что он правит.
    renderScreen(TEXT_ONLY, LOCAL_SUGGESTER);

    expect(screen.getByRole('heading', { level: 1, name: 'Созвон по релизу' })).toBeInTheDocument();
    expect(screen.getByText(/CAIRN/)).toBeInTheDocument();
    expect(screen.getByText(/16\.11\.2026/)).toBeInTheDocument();
  });

  it('идущая расшифровка названа биркой в шапке', () => {
    // Шапка — единственное место, где состояние потока названо целиком
    // (дизайн, 4.1).
    renderScreen(
      {
        ...FROM_RECORDING,
        transcription: { ...FROM_RECORDING.transcription!, state: TranscriptionState.Running },
      },
      LOCAL_SUGGESTER,
    );

    expect(screen.getByText('Идёт расшифровка')).toBeInTheDocument();
  });

  it('законченная расшифровка бирки не держит', () => {
    renderScreen(FROM_RECORDING, LOCAL_SUGGESTER);

    expect(screen.queryByText('Идёт расшифровка')).not.toBeInTheDocument();
  });

  it('идущая разбивка названа биркой в шапке', () => {
    vi.mocked(hooks.useMutationSuggestSummaryTasks).mockReturnValue(pending());

    renderScreen(TEXT_ONLY, LOCAL_SUGGESTER);

    expect(screen.getByText('Идёт разбивка')).toBeInTheDocument();
  });

  it('правленный после разбивки текст назван биркой в шапке', () => {
    renderScreen({ ...WITH_TASKS, isTextStale: true }, LOCAL_SUGGESTER);

    expect(screen.getByText('Текст правили после разбивки')).toBeInTheDocument();
  });

  it('сформированный релиз назван биркой в шапке', () => {
    renderScreen(RELEASED_DETAIL, LOCAL_SUGGESTER);

    expect(screen.getByText('Релиз сформирован')).toBeInTheDocument();
  });

  it('у саммари в работе бирок состояния нет вовсе', () => {
    // Отсутствие бирок и означает «всё обычно»: бирка «в работе» стояла
    // бы всегда и перестала бы читаться.
    renderScreen(WITH_TASKS, LOCAL_SUGGESTER);

    expect(screen.queryByText('Идёт разбивка')).not.toBeInTheDocument();
    expect(screen.queryByText('Текст правили после разбивки')).not.toBeInTheDocument();
    expect(screen.queryByText('Релиз сформирован')).not.toBeInTheDocument();
  });

  it('саммари из чужого проекта не раскрывается', () => {
    // Проект берётся из сводной выдачи: нет строки — нечего показывать.
    vi.mocked(hooks.useQuerySummaries).mockReturnValue(query([]));
    vi.mocked(hooks.useQuerySummary).mockReturnValue(query(undefined));
    vi.mocked(hooks.useQueryTaskSuggester).mockReturnValue(query(LOCAL_SUGGESTER));

    render(<SummaryScreen summaryId={SUMMARY_ID} />, { wrapper });

    expect(screen.getByText(/не найдено/)).toBeInTheDocument();
  });
});
