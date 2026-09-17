import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CheckpointForm } from './CheckpointForm';

describe('CheckpointForm', () => {
  it('не отправляет пустую формулировку', async () => {
    const onSubmit = vi.fn();
    render(<CheckpointForm onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('отправляет формулировку и очищает поле', async () => {
    const onSubmit = vi.fn();
    render(<CheckpointForm onSubmit={onSubmit} />);

    const field = screen.getByLabelText('Формулировка');
    await userEvent.type(field, 'Готов вход');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(onSubmit).toHaveBeenCalledWith({ title: 'Готов вход' });
    expect(field).toHaveValue('');
  });

  it('поддерживает предзаполнение', () => {
    render(<CheckpointForm initialTitle="Из хроники" onSubmit={vi.fn()} />);

    expect(screen.getByLabelText('Формулировка')).toHaveValue('Из хроники');
  });

  it('показывает отказ сервера, а не молчит', () => {
    render(<CheckpointForm onSubmit={vi.fn()} error="Формулировка: заполните поле" />);

    expect(screen.getByRole('alert')).toHaveTextContent('заполните поле');
  });

  it('даёт полю семь строк высоты', () => {
    render(<CheckpointForm onSubmit={vi.fn()} />);

    expect(screen.getByLabelText('Формулировка')).toHaveAttribute('rows', '7');
  });

  it('отправляет по Ctrl+Enter', async () => {
    const onSubmit = vi.fn();
    render(<CheckpointForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Формулировка'), 'Перевести биллинг');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    expect(onSubmit).toHaveBeenCalledWith({ title: 'Перевести биллинг' });
  });

  it('не отправляет пустую формулировку по Ctrl+Enter', async () => {
    const onSubmit = vi.fn();
    render(<CheckpointForm onSubmit={onSubmit} />);

    await userEvent.click(screen.getByLabelText('Формулировка'));
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
