import {
  PlatformKind,
  PlatformReleaseState,
  RoadmapVersionState,
  type PublicReleaseReport,
} from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PublicReportView } from './PublicReportView';

const store = { id: 'pl1', kind: PlatformKind.Store, name: 'App Store', position: 1 };

const report: PublicReleaseReport = {
  projectName: 'Витрина',
  version: {
    id: 'v1',
    label: 'v1.2',
    state: RoadmapVersionState.Released,
    plannedDate: null,
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
  ],
  summary: [],
  checkpoints: [
    { id: 'c1', taskId: 't-c1', title: 'Оплата', isDone: true, position: 1, platformIds: ['pl1'], carriedFrom: null },
  ],
  carriedOut: [
    { id: 'c2', taskId: 't-c2', title: 'Экспорт', isDone: false, position: 2, platformIds: [], carriedTo: 'v1.3' },
  ],
  markdown: '# Отчёт по релизу v1.2',
  text: 'Отчёт по релизу v1.2',
};

describe('PublicReportView', () => {
  it('называет проект и версию', () => {
    render(<PublicReportView report={report} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Витрина');
    expect(screen.getByRole('heading', { name: 'v1.2' })).toBeInTheDocument();
  });

  it('показывает состав отчёта', () => {
    render(<PublicReportView report={report} />);

    expect(screen.getByRole('list', { name: 'Выпуски' })).toHaveTextContent('сборка 1.2.3');
    expect(screen.getByRole('list', { name: 'Чекпоинты' })).toHaveTextContent('Оплата');
    expect(screen.getByRole('list', { name: 'Перенесено в другие версии' })).toHaveTextContent(
      'перенесено в v1.3',
    );
  });

  it('не ведёт ни в систему, ни во внешний трекер', () => {
    // Инварианты публичной выдачи: ссылка на задачу наружу не уходит
    // никогда, а страница живёт вне приложения — ни навигации, ни входа.
    render(<PublicReportView report={report} />);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('даёт скопировать тот же текст, что и внутренняя страница', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    render(<PublicReportView report={report} />);

    await userEvent.click(screen.getByRole('button', { name: 'Скопировать текст' }));

    expect(writeText).toHaveBeenCalledWith(report.text);

    vi.unstubAllGlobals();
  });
});
