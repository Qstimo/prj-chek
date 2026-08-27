import { ProjectLifecycle } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProjectForm } from './ProjectForm';

const project = {
  name: 'Проект',
  purpose: 'Назначение',
  stack: 'Next.js',
  repoUrl: 'https://example.com/repo',
  notes: null,
  lifecycle: ProjectLifecycle.Active,
};

describe('ProjectForm', () => {
  it('заполняет поля текущими значениями', () => {
    render(<ProjectForm initial={project} onSubmit={vi.fn()} />);

    expect(screen.getByLabelText('Название')).toHaveValue('Проект');
    expect(screen.getByLabelText('Назначение')).toHaveValue('Назначение');
  });

  it('передаёт изменённые значения', async () => {
    const onSubmit = vi.fn();
    render(<ProjectForm initial={project} onSubmit={onSubmit} />);

    await userEvent.clear(screen.getByLabelText('Название'));
    await userEvent.type(screen.getByLabelText('Название'), 'Новое имя');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Новое имя' }));
  });

  it('не отправляет пустое название', async () => {
    const onSubmit = vi.fn();
    render(<ProjectForm initial={project} onSubmit={onSubmit} />);

    await userEvent.clear(screen.getByLabelText('Название'));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('предлагает все состояния жизненного цикла', () => {
    render(<ProjectForm initial={project} onSubmit={vi.fn()} />);

    const select = screen.getByLabelText('Состояние');

    expect(select).toHaveValue(ProjectLifecycle.Active);
    expect(screen.getByRole('option', { name: 'Приостановлен' })).toBeInTheDocument();
  });

  it('превращает очищенное необязательное поле в пустое значение', async () => {
    // Пустая строка и «поля нет» — разные вещи: первая замусорила бы паспорт.
    const onSubmit = vi.fn();
    render(<ProjectForm initial={project} onSubmit={onSubmit} />);

    await userEvent.clear(screen.getByLabelText('Назначение'));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ purpose: null }));
  });

  it('не даёт сохранить во время отправки', () => {
    render(<ProjectForm initial={project} onSubmit={vi.fn()} isSubmitting />);

    expect(screen.getByRole('button', { name: 'Сохранение…' })).toBeDisabled();
  });
});
