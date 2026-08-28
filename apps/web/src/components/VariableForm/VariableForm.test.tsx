import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VariableForm } from './VariableForm';

describe('VariableForm', () => {
  it('не отправляет форму без ключа', async () => {
    const onSubmit = vi.fn();
    render(<VariableForm onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('при создании требует значение', async () => {
    const onSubmit = vi.fn();
    render(<VariableForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Ключ'), 'DATABASE_URL');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('отправляет создание с ключом и значением', async () => {
    const onSubmit = vi.fn();
    render(<VariableForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Ключ'), 'DATABASE_URL');
    await userEvent.type(screen.getByLabelText('Значение'), 'postgres://db');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith({
      key: 'DATABASE_URL',
      description: null,
      value: 'postgres://db',
    });
  });

  it('при правке пустое значение не отправляется', async () => {
    // Пустое поле значит «не менять», а не «стереть» — иначе правка
    // описания затирала бы секрет.
    const onSubmit = vi.fn();
    render(
      <VariableForm
        initial={{ key: 'KEY', description: 'старое' }}
        isEditing
        onSubmit={onSubmit}
      />,
    );

    await userEvent.clear(screen.getByLabelText('Описание'));
    await userEvent.type(screen.getByLabelText('Описание'), 'новое');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith({ key: 'KEY', description: 'новое' });
    expect(onSubmit.mock.calls[0]![0]).not.toHaveProperty('value');
  });

  it('показывает ошибку сервера', () => {
    render(<VariableForm onSubmit={vi.fn()} error="Ключ занят" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Ключ занят');
  });
});
