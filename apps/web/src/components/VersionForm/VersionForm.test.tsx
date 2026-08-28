import { RoadmapVersionState } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VersionForm } from './VersionForm';

describe('VersionForm', () => {
  it('не отправляет форму без обозначения', async () => {
    const onSubmit = vi.fn();
    render(<VersionForm onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('отправляет обозначение, состояние и дату', async () => {
    const onSubmit = vi.fn();
    render(<VersionForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Обозначение'), 'v1.0');
    await userEvent.selectOptions(screen.getByLabelText('Состояние'), 'in_progress');
    await userEvent.type(screen.getByLabelText('Плановая дата'), '2026-12-01');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith({
      label: 'v1.0',
      state: RoadmapVersionState.InProgress,
      plannedDate: '2026-12-01',
    });
  });

  it('пустая дата уходит как отсутствие', async () => {
    const onSubmit = vi.fn();
    render(<VersionForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Обозначение'), 'v1.0');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ plannedDate: null }));
  });

  it('показывает ошибку сервера', () => {
    render(<VersionForm onSubmit={vi.fn()} error="Обозначение занято" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Обозначение занято');
  });
});
