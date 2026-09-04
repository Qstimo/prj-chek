import { RoadmapVersionState } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VersionDrawer } from './VersionDrawer';
import type { IVersionActions } from './types';

const detail = {
  id: '1',
  label: 'v1.0',
  state: RoadmapVersionState.InProgress,
  plannedDate: '2026-12-01',
  releasedDate: null,
  position: 1,
  progress: { done: 1, total: 2 },
  checkpoints: [
    { id: 'c1', title: 'Оплата', isDone: true, position: 1 },
    { id: 'c2', title: 'Доставка', isDone: false, position: 2 },
  ],
};

function makeActions(overrides: Partial<IVersionActions> = {}): IVersionActions {
  return {
    onToggleCheckpoint: vi.fn(),
    onAddCheckpoint: vi.fn(),
    onDeleteCheckpoint: vi.fn(),
    onSubmitVersion: vi.fn(),
    onDeleteVersion: vi.fn(),
    isSubmittingVersion: false,
    isSubmittingCheckpoint: false,
    ...overrides,
  };
}

describe('VersionDrawer', () => {
  it('просмотр: паспорт, прогресс и чекпоинты', () => {
    render(<VersionDrawer version={detail} isCurrent isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'v1.0' })).toBeInTheDocument();
    expect(screen.getByText('В работе')).toBeInTheDocument();
    expect(screen.getByText('01.12.2026')).toBeInTheDocument();
    expect(screen.getByText('1 из 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Оплата')).toBeChecked();
  });

  it('без actions органов управления нет', () => {
    render(<VersionDrawer version={detail} isCurrent={false} isOpen onClose={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить версию' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Доставка')).toBeDisabled();
  });

  it('версия-метаданные — без блока чекпоинтов', () => {
    const { checkpoints: _checkpoints, ...metadata } = detail;
    render(<VersionDrawer version={metadata} isCurrent={false} isOpen onClose={vi.fn()} />);

    expect(screen.getByText('1 из 2')).toBeInTheDocument();
    expect(screen.queryByLabelText('Оплата')).not.toBeInTheDocument();
  });

  it('галочка чекпоинта зовёт onToggleCheckpoint', async () => {
    const actions = makeActions();
    render(
      <VersionDrawer version={detail} isCurrent={false} isOpen onClose={vi.fn()} actions={actions} />,
    );

    await userEvent.click(screen.getByLabelText('Доставка'));

    expect(actions.onToggleCheckpoint).toHaveBeenCalledWith('c2', true);
  });

  it('редактирование открывается и отменяется', async () => {
    render(
      <VersionDrawer
        version={detail}
        isCurrent={false}
        isOpen
        onClose={vi.fn()}
        actions={makeActions()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    expect(screen.getByLabelText('Обозначение')).toHaveValue('v1.0');

    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(screen.queryByLabelText('Обозначение')).not.toBeInTheDocument();
  });

  it('сохранение передаёт форму и колбэк возврата в просмотр', async () => {
    const actions = makeActions();
    render(
      <VersionDrawer version={detail} isCurrent={false} isOpen onClose={vi.fn()} actions={actions} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(actions.onSubmitVersion).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'v1.0' }),
      expect.any(Function),
    );
  });

  it('удаление версии — в два шага', async () => {
    const actions = makeActions();
    render(
      <VersionDrawer version={detail} isCurrent={false} isOpen onClose={vi.fn()} actions={actions} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Удалить версию' }));
    expect(actions.onDeleteVersion).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));
    expect(actions.onDeleteVersion).toHaveBeenCalled();
  });
});
