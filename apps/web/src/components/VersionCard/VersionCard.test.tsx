import { RoadmapVersionState } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VersionCard } from './VersionCard';

const metadataVersion = {
  id: '11111111-1111-1111-1111-111111111111',
  label: 'v1.0',
  state: RoadmapVersionState.InProgress,
  plannedDate: '2026-12-01',
  releasedDate: null,
  position: 1,
  progress: { done: 1, total: 2 },
};

const detailVersion = {
  ...metadataVersion,
  checkpoints: [
    { id: 'c1', title: 'Готов вход', isDone: true, position: 1 },
    { id: 'c2', title: 'Готовы проекты', isDone: false, position: 2 },
  ],
};

const noop = {
  onToggleCheckpoint: vi.fn(),
  onEditVersion: vi.fn(),
  onDeleteVersion: vi.fn(),
  onDeleteCheckpoint: vi.fn(),
  onAddCheckpoint: vi.fn(),
};

describe('VersionCard', () => {
  it('показывает обозначение, состояние и прогресс', () => {
    render(<VersionCard version={metadataVersion} {...noop} />);

    expect(screen.getByText('v1.0')).toBeInTheDocument();
    expect(screen.getByText('В работе')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('на уровне метаданных чекпоинтов нет', () => {
    render(<VersionCard version={metadataVersion} {...noop} />);

    expect(screen.queryByText('Готов вход')).not.toBeInTheDocument();
  });

  it('на уровне чтения чекпоинты видны, но галочки заблокированы', () => {
    render(<VersionCard version={detailVersion} {...noop} />);

    expect(screen.getByText('Готов вход')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Готов вход' })).toBeDisabled();
  });

  it('при праве записи галочка переключает чекпоинт', async () => {
    const onToggleCheckpoint = vi.fn();
    render(
      <VersionCard
        version={detailVersion}
        canWrite
        {...noop}
        onToggleCheckpoint={onToggleCheckpoint}
      />,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: 'Готовы проекты' }));

    expect(onToggleCheckpoint).toHaveBeenCalledWith('c2', true);
  });

  it('удаление версии требует подтверждения', async () => {
    const onDeleteVersion = vi.fn();
    render(
      <VersionCard version={detailVersion} canWrite {...noop} onDeleteVersion={onDeleteVersion} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Удалить версию' }));
    expect(onDeleteVersion).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));
    expect(onDeleteVersion).toHaveBeenCalled();
  });
});
