import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { InviteForm } from './InviteForm';

describe('InviteForm', () => {
  it('передаёт адрес в нижнем регистре', async () => {
    const onSubmit = vi.fn();
    render(<InviteForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Пригласить по адресу'), 'User@Cairn.Local');
    await userEvent.click(screen.getByRole('button', { name: 'Пригласить' }));

    expect(onSubmit).toHaveBeenCalledWith({ email: 'user@cairn.local' });
  });

  it('не отправляет пустой адрес', async () => {
    const onSubmit = vi.fn();
    render(<InviteForm onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Пригласить' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('показывает отказ по уже существующему адресу', () => {
    // Бэкенд отвечает 409 для действующего пользователя (спека 4.6).
    render(<InviteForm onSubmit={vi.fn()} error="Пользователь уже работает в системе" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Пользователь уже работает в системе');
  });
});
