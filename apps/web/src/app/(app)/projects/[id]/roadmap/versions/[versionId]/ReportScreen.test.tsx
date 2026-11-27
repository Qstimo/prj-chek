import {
  PlatformKind,
  PlatformReleaseState,
  RoadmapVersionState,
  type ReleaseReport,
} from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as hooks from '@/api/hooks';

import { ReportScreen } from './ReportScreen';

vi.mock('@/api/hooks');

const PROJECT_ID = 'p1';
const VERSION_ID = 'v1';

const store = { id: 'pl1', kind: PlatformKind.Store, name: 'App Store', position: 1 };

const report: ReleaseReport = {
  version: {
    id: VERSION_ID,
    label: 'v1.2',
    state: RoadmapVersionState.Released,
    plannedDate: '2026-06-15',
    releasedDate: '2026-06-20',
    position: 2,
    progress: { done: 2, total: 2 },
    unfinished: 0,
    hasUnfinishedOnRelease: false,
  },
  releases: [
    {
      platform: store,
      state: PlatformReleaseState.Released,
      releasedDate: '2026-06-20',
      buildLabel: '1.2.3',
    },
  ],
  summary: [],
  checkpoints: [
    {
      id: 'c1',
      taskId: 't-c1',
      title: 'Оплата',
      isDone: true,
      position: 1,
      url: null,
      assignees: [],
      platformIds: [],
      carriedFrom: null,
    },
  ],
  carriedOut: [],
  markdown: '# Отчёт по релизу v1.2',
  text: 'Отчёт по релизу v1.2',
};

const link = { token: 'abc', url: 'https://cairn.local/roadmap/report/abc' };

/** Успешный query-результат для мока. */
function query<T>(data: T) {
  return { data, isPending: false, isError: false, error: null } as never;
}

/** Бездействующая мутация для мока. */
function mutation() {
  return { mutate: vi.fn(), isPending: false, error: null } as never;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(hooks.useQueryReport).mockReturnValue(query(report));
  vi.mocked(hooks.useQueryReportLink).mockReturnValue(query(null));
  vi.mocked(hooks.useMutationPublishReport).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationUnpublishReport).mockReturnValue(mutation());
});

describe('ReportScreen', () => {
  it('показывает отчёт целиком', () => {
    render(<ReportScreen projectId={PROJECT_ID} versionId={VERSION_ID} isSuperadmin={false} />);

    expect(screen.getByRole('heading', { name: 'v1.2' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Выпуски' })).toHaveTextContent('сборка 1.2.3');
    expect(screen.getByRole('list', { name: 'Чекпоинты' })).toHaveTextContent('Оплата');
  });

  it('ведёт к версии в роадмапе', () => {
    // Правка версии живёт в панели роадмапа, и отчёт обязан давать к ней
    // путь: иначе со страницы отчёта некуда вернуться к делу.
    render(<ReportScreen projectId={PROJECT_ID} versionId={VERSION_ID} isSuperadmin={false} />);

    expect(screen.getByRole('link', { name: /в роадмапе/i })).toHaveAttribute(
      'href',
      `/projects/${PROJECT_ID}/roadmap?version=${VERSION_ID}`,
    );
  });

  it('пока отчёт грузится, говорит об этом', () => {
    vi.mocked(hooks.useQueryReport).mockReturnValue({ isPending: true, isError: false } as never);

    render(<ReportScreen projectId={PROJECT_ID} versionId={VERSION_ID} isSuperadmin={false} />);

    expect(screen.getByText(/загрузка/i)).toBeInTheDocument();
  });

  it('отказ сервера показывает, а не прячет', () => {
    // Панель статуса однажды гасила ошибку и загрузку одним `return null`,
    // и человек с доступом не видел ничего. Здесь это разведено.
    vi.mocked(hooks.useQueryReport).mockReturnValue({
      isPending: false,
      isError: true,
      error: null,
    } as never);

    render(<ReportScreen projectId={PROJECT_ID} versionId={VERSION_ID} isSuperadmin={false} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/не удалось загрузить отчёт/i);
  });

  it('копирует готовый текст с сервера', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    render(<ReportScreen projectId={PROJECT_ID} versionId={VERSION_ID} isSuperadmin={false} />);

    await userEvent.click(screen.getByRole('button', { name: 'Скопировать Markdown' }));

    expect(writeText).toHaveBeenCalledWith(report.markdown);
  });

  it('публиковать отчёт даёт только суперадмину', () => {
    const reader = render(
      <ReportScreen projectId={PROJECT_ID} versionId={VERSION_ID} isSuperadmin={false} />,
    );

    expect(screen.getByText(/отчёт не опубликован/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Опубликовать отчёт' })).not.toBeInTheDocument();
    reader.unmount();

    render(<ReportScreen projectId={PROJECT_ID} versionId={VERSION_ID} isSuperadmin />);

    expect(screen.getByRole('button', { name: 'Опубликовать отчёт' })).toBeInTheDocument();
  });

  it('опубликованную ссылку показывает и читающему', async () => {
    // Рассылает ссылку тот, кто читает отчёт, а не только суперадмин.
    vi.mocked(hooks.useQueryReportLink).mockReturnValue(query(link));

    render(<ReportScreen projectId={PROJECT_ID} versionId={VERSION_ID} isSuperadmin={false} />);

    expect(screen.getByText(link.url)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отключить ссылку' })).not.toBeInTheDocument();
  });

  it('публикация уходит мутацией', async () => {
    const mutate = vi.fn();
    vi.mocked(hooks.useMutationPublishReport).mockReturnValue(
      { mutate, isPending: false, error: null } as never,
    );

    render(<ReportScreen projectId={PROJECT_ID} versionId={VERSION_ID} isSuperadmin />);

    await userEvent.click(screen.getByRole('button', { name: 'Опубликовать отчёт' }));

    expect(mutate).toHaveBeenCalled();
  });
});
