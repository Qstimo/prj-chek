import {
  PlatformKind,
  PlatformReleaseState,
  RoadmapVersionState,
  type PublicReleaseReport,
  type ReleaseReport as ReleaseReportData,
} from '@cairn/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReleaseReport } from './ReleaseReport';

const store = { id: 'p1', kind: PlatformKind.Store, name: 'App Store', position: 1 };
const server = { id: 'p2', kind: PlatformKind.Server, name: 'Веб', position: 2 };

const report: ReleaseReportData = {
  version: {
    id: 'v1',
    label: 'v1.2',
    state: RoadmapVersionState.Released,
    plannedDate: '2026-06-15',
    releasedDate: '2026-06-20',
    position: 2,
    progress: { done: 1, total: 2 },
    unfinished: 1,
    hasUnfinishedOnRelease: true,
  },
  releases: [
    {
      platform: store,
      state: PlatformReleaseState.Released,
      releasedDate: '2026-06-20',
      buildLabel: '1.2.3',
    },
    { platform: server, state: null, releasedDate: null, buildLabel: null },
  ],
  summary: [
    {
      platform: store,
      released: {
        versionId: 'v1',
        versionLabel: 'v1.2',
        buildLabel: '1.2.3',
        date: null,
      },
      pending: [],
    },
  ],
  checkpoints: [
    {
      id: 'c1',
      taskId: 't-c1',
      title: 'Оплата',
      isDone: true,
      position: 1,
      url: 'https://tracker.local/T-1',
      assignees: [],
      platformIds: ['p1'],
      carriedFrom: null,
    },
    {
      id: 'c2',
      taskId: 't-c2',
      title: 'Отчёты',
      isDone: false,
      position: 2,
      url: null,
      assignees: [],
      platformIds: [],
      carriedFrom: 'v1.1',
    },
  ],
  carriedOut: [
    {
      id: 'c3',
      taskId: 't-c3',
      title: 'Экспорт',
      isDone: false,
      position: 3,
      url: null,
      assignees: [],
      platformIds: ['p2'],
      carriedTo: 'v1.3',
    },
  ],
  markdown: '# Отчёт по релизу v1.2',
  text: 'Отчёт по релизу v1.2',
};

/** Публичный отчёт: тот же состав, но без ссылок на задачи вовсе. */
const publicReport: PublicReleaseReport = {
  projectName: 'Витрина',
  version: report.version,
  releases: report.releases,
  summary: report.summary,
  checkpoints: report.checkpoints.map(({ url: _url, ...rest }) => rest),
  carriedOut: report.carriedOut.map(({ url: _url, ...rest }) => rest),
  markdown: report.markdown,
  text: report.text,
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('ReleaseReport', () => {
  it('показывает паспорт версии', () => {
    render(<ReleaseReport report={report} />);

    expect(screen.getByRole('heading', { name: /v1\.2/ })).toBeInTheDocument();
    expect(screen.getByText('Выпущена')).toBeInTheDocument();
    expect(screen.getByText('15.06.2026')).toBeInTheDocument();
    expect(screen.getByText('20.06.2026')).toBeInTheDocument();
    expect(screen.getByText('1 из 2')).toBeInTheDocument();
  });

  it('называет расхождение «выпущено, но не закрыто» числом', () => {
    // Пометка, а не отказ: выпуск с незакрытыми чекпоинтами разрешён, и
    // без числа читателю неясно, насколько велико расхождение.
    render(<ReleaseReport report={report} />);

    expect(screen.getByText(/Незакрыто на выпуске: 1/)).toBeInTheDocument();
  });

  it('у платформы без своей строки выпуска говорит это словами', () => {
    // Прочерк прочли бы как «неизвестно», а это «едет вместе с версией».
    render(<ReleaseReport report={report} />);

    const releases = screen.getByRole('list', { name: 'Выпуски' });

    expect(releases).toHaveTextContent('App Store');
    expect(releases).toHaveTextContent('в релизе');
    expect(releases).toHaveTextContent('сборка 1.2.3');
    expect(releases).toHaveTextContent('Веб');
    expect(releases).toHaveTextContent('идёт вместе с версией');
  });

  it('показывает чекпоинты с отметкой готовности, тегами и следом переноса', () => {
    render(<ReleaseReport report={report} />);

    const checkpoints = screen.getByRole('list', { name: 'Чекпоинты' });

    expect(checkpoints).toHaveTextContent('Оплата');
    expect(checkpoints).toHaveTextContent('готово');
    expect(checkpoints).toHaveTextContent('App Store');
    expect(checkpoints).toHaveTextContent('не закрыт');
    expect(checkpoints).toHaveTextContent('принято из v1.1');
  });

  it('держит формулировку, теги и след переноса одним текстовым блоком', () => {
    // Соседними элементами гибкой строки они ломали вёрстку: длинная
    // формулировка — один неразрывный элемент, она уезжала на свою
    // строку, а теги со следом переноса переносились под отметку и
    // читались как начало следующего чекпоинта. Проверяется разметкой:
    // ширины и переносы в jsdom не считаются.
    render(<ReleaseReport report={report} />);

    const carried = screen.getByText(/принято из v1\.1/);
    const line = carried.closest('li');
    const mark = within(line!).getByText('не закрыт');

    // Отметка — сосед текстового блока, а не его часть.
    expect(carried.parentElement).not.toBe(line);
    expect(mark.parentElement).toBe(line);
    expect(carried.parentElement).toHaveTextContent('Отчёты');
    expect(carried.parentElement).not.toHaveTextContent('не закрыт');
  });

  it('перечисляет унесённое в другие версии', () => {
    // Иначе отчёт умолчал бы о том, что из релиза выпало.
    render(<ReleaseReport report={report} />);

    expect(screen.getByRole('list', { name: 'Перенесено в другие версии' })).toHaveTextContent(
      'Экспорт',
    );
    expect(screen.getByText(/перенесено в v1\.3/)).toBeInTheDocument();
  });

  it('ставит сводку «что в релизе, что в пути»', () => {
    render(<ReleaseReport report={report} />);

    expect(screen.getByRole('heading', { name: 'Что в релизе, что в пути' })).toBeInTheDocument();
    // Сводка та же, что наверху роадмапа: плашка состояния с обозначением.
    expect(screen.getByText('в релизе 1.2.3')).toBeInTheDocument();
  });

  it('ссылку на задачу показывает внутри и не показывает наружу', () => {
    const internal = render(<ReleaseReport report={report} />);

    expect(screen.getByRole('link', { name: /Оплата/ })).toHaveAttribute(
      'href',
      'https://tracker.local/T-1',
    );
    internal.unmount();

    render(<ReleaseReport report={publicReport} />);

    // Инвариант: адрес внешнего трекера наружу не уходит никогда, и у
    // публичной выдачи поля `url` нет вовсе.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Оплата')).toBeInTheDocument();
  });

  it('на уровне «метаданные» отдаёт паспорт, а не падает', () => {
    // Версия приходит без чекпоинтов и выпусков: это уровень доступа,
    // а не пустой отчёт, и `undefined` здесь быть не должно.
    render(
      <ReleaseReport
        report={{ ...report, releases: [], checkpoints: [], carriedOut: [], summary: [] }}
      />,
    );

    expect(screen.getByText('1 из 2')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Выпуски' })).not.toBeInTheDocument();
    expect(screen.getByText(/кроме паспорта версии/i)).toBeInTheDocument();
  });

  it('копирует готовый текст с сервера, а не собранный заново', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    render(<ReleaseReport report={report} />);

    await userEvent.click(screen.getByRole('button', { name: 'Скопировать Markdown' }));
    expect(writeText).toHaveBeenCalledWith(report.markdown);
    expect(screen.getByRole('status')).toHaveTextContent(/скопировано/i);

    await userEvent.click(screen.getByRole('button', { name: 'Скопировать текст' }));
    expect(writeText).toHaveBeenLastCalledWith(report.text);
  });

  it('без доступа к буферу даёт текст для ручного копирования', async () => {
    // Буфера нет без защищённого соединения и в части браузеров: молчаливый
    // отказ выглядел бы как «кнопка не работает».
    vi.stubGlobal('navigator', {});

    render(<ReleaseReport report={report} />);

    await userEvent.click(screen.getByRole('button', { name: 'Скопировать текст' }));

    expect(screen.getByRole('textbox', { name: /отчёт/i })).toHaveValue(report.text);
    expect(screen.getByRole('alert')).toHaveTextContent(/вручную/i);
  });
});
