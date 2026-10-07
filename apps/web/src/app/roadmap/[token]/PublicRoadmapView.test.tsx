import { PlatformKind, RoadmapVersionState } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { PublicRoadmapView } from './PublicRoadmapView';

const roadmap = {
  projectName: 'Проект',
  stage: { current: 1, total: 1 },
  versions: [
    {
      id: '1',
      label: 'v1.0',
      state: RoadmapVersionState.InProgress,
      plannedDate: '2026-12-01',
      releasedDate: null,
      position: 1,
      progress: { done: 0, total: 1 },
      releases: [],
      checkpoints: [{ id: 'c1', title: 'Оплата', isDone: false, position: 1, platformIds: [] }],
    },
  ],
  summary: [
    {
      platform: { id: 'p1', kind: PlatformKind.Server, name: 'API', position: 1 },
      released: { versionId: '1', versionLabel: 'v1.2', buildLabel: null, date: '2026-03-14' },
      pending: [],
    },
  ],
};

describe('PublicRoadmapView', () => {
  it('клик по версии открывает панель просмотра', async () => {
    render(<PublicRoadmapView roadmap={roadmap} />);

    await userEvent.click(screen.getByRole('button', { name: 'Версия v1.0' }));

    expect(screen.getByRole('dialog', { name: 'v1.0' })).toBeInTheDocument();
    expect(screen.getByLabelText('Оплата')).toBeInTheDocument();
  });

  it('панель — только чтение', async () => {
    render(<PublicRoadmapView roadmap={roadmap} />);

    await userEvent.click(screen.getByRole('button', { name: 'Версия v1.0' }));

    expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Оплата')).toBeDisabled();
  });

  it('показывает сводку без адресов', () => {
    render(<PublicRoadmapView roadmap={roadmap} />);

    expect(screen.getByText('API')).toBeInTheDocument();
    expect(screen.getByText('в релизе v1.2')).toBeInTheDocument();
    expect(screen.queryByText(/example\.com/)).not.toBeInTheDocument();
  });
});
