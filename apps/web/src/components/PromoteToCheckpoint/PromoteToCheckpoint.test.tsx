import { RoadmapVersionState } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PromoteToCheckpoint } from './PromoteToCheckpoint';

const versions = [
  {
    id: 'v-1',
    label: 'v1.0',
    state: RoadmapVersionState.InProgress,
    plannedDate: null,
    position: 1,
    progress: { done: 0, total: 0 },
  },
];

describe('PromoteToCheckpoint', () => {
  it('предзаполняет формулировку заголовком записи', () => {
    render(
      <PromoteToCheckpoint
        entryTitle="Сводка встречи"
        versions={versions}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Формулировка')).toHaveValue('Сводка встречи');
  });

  it('создаёт чекпоинт в выбранной версии', async () => {
    const onSubmit = vi.fn();
    render(
      <PromoteToCheckpoint
        entryTitle="Сводка встречи"
        versions={versions}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Создать чекпоинт' }));

    expect(onSubmit).toHaveBeenCalledWith('v-1', 'Сводка встречи');
  });

  it('без версий объясняет, что поднимать некуда', () => {
    render(
      <PromoteToCheckpoint
        entryTitle="Сводка"
        versions={[]}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/нет версий/i)).toBeInTheDocument();
  });
});
