import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { UserForm } from './UserForm';

const EMPTY = { name: '', email: '' };

describe('UserForm', () => {
  it('не отправляет форму без имени', async () => {
    const onSubmit = vi.fn();
    render(<UserForm initial={EMPTY} submitLabel="Пригласить" onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Почта'), 'anna@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Пригласить' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('отдаёт имя и почту, обрезая края', async () => {
    const onSubmit = vi.fn();
    render(<UserForm initial={EMPTY} submitLabel="Пригласить" onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Имя'), '  Анна  ');
    await userEvent.type(screen.getByLabelText('Почта'), 'Anna@Example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Пригласить' }));

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Анна', email: 'anna@example.com' });
  });

  it('показывает начальные значения при правке', () => {
    render(
      <UserForm
        initial={{ name: 'Анна', email: 'anna@example.com' }}
        submitLabel="Сохранить"
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Имя')).toHaveValue('Анна');
    expect(screen.getByLabelText('Почта')).toHaveValue('anna@example.com');
  });

  it('показывает отказ сервера', () => {
    render(
      <UserForm
        initial={EMPTY}
        submitLabel="Сохранить"
        onSubmit={vi.fn()}
        error="Этот адрес уже занят"
      />,
    );

    expect(screen.getByText(/уже занят/i)).toBeInTheDocument();
  });
});
