import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LoginForm } from './LoginForm';

describe('LoginForm', () => {
  it('показывает поля адреса и пароля', () => {
    render(<LoginForm onSubmit={vi.fn()} />);

    expect(screen.getByLabelText('Адрес электронной почты')).toBeInTheDocument();
    expect(screen.getByLabelText('Пароль')).toBeInTheDocument();
  });

  it('передаёт введённые данные', async () => {
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Адрес электронной почты'), 'user@cairn.local');
    await userEvent.type(screen.getByLabelText('Пароль'), 'пароль');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));

    expect(onSubmit).toHaveBeenCalledWith({ email: 'user@cairn.local', password: 'пароль' });
  });

  it('не отправляет форму с пустыми полями', async () => {
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('скрывает пароль от посторонних глаз', () => {
    render(<LoginForm onSubmit={vi.fn()} />);

    expect(screen.getByLabelText('Пароль')).toHaveAttribute('type', 'password');
  });

  it('показывает сообщение об ошибке', () => {
    render(<LoginForm onSubmit={vi.fn()} error="Неверный адрес или пароль" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Неверный адрес или пароль');
  });

  it('блокирует кнопку во время отправки', () => {
    render(<LoginForm onSubmit={vi.fn()} isSubmitting />);

    expect(screen.getByRole('button', { name: 'Вход…' })).toBeDisabled();
  });

  it('связывает ошибку с формой для программ чтения с экрана', () => {
    render(<LoginForm onSubmit={vi.fn()} error="Неверный адрес или пароль" />);

    expect(screen.getByRole('alert')).toHaveAttribute('id');
  });
});
