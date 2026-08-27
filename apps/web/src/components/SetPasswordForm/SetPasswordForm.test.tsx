import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SetPasswordForm } from './SetPasswordForm';

describe('SetPasswordForm', () => {
  it('просит пароль дважды', () => {
    render(<SetPasswordForm onSubmit={vi.fn()} />);

    expect(screen.getByLabelText('Новый пароль')).toBeInTheDocument();
    expect(screen.getByLabelText('Повторите пароль')).toBeInTheDocument();
  });

  it('передаёт пароль при совпадении', async () => {
    const onSubmit = vi.fn();
    render(<SetPasswordForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Новый пароль'), 'очень длинный пароль');
    await userEvent.type(screen.getByLabelText('Повторите пароль'), 'очень длинный пароль');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }));

    expect(onSubmit).toHaveBeenCalledWith('очень длинный пароль');
  });

  it('не отправляет при расхождении', async () => {
    // Опечатка во втором поле оставила бы человека без доступа: ссылка
    // одноразовая, а пароль он не запомнил бы.
    const onSubmit = vi.fn();
    render(<SetPasswordForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Новый пароль'), 'очень длинный пароль');
    await userEvent.type(screen.getByLabelText('Повторите пароль'), 'другой длинный пароль');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('сообщает о расхождении', async () => {
    render(<SetPasswordForm onSubmit={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Новый пароль'), 'очень длинный пароль');
    await userEvent.type(screen.getByLabelText('Повторите пароль'), 'другой');

    expect(screen.getByText('Пароли не совпадают')).toBeInTheDocument();
  });

  it('требует пароль не короче двенадцати символов', async () => {
    const onSubmit = vi.fn();
    render(<SetPasswordForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Новый пароль'), 'короткий');
    await userEvent.type(screen.getByLabelText('Повторите пароль'), 'короткий');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/12 символов/)).toBeInTheDocument();
  });
});
