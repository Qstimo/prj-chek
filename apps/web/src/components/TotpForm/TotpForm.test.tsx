import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TotpForm } from './TotpForm';

describe('TotpForm', () => {
  it('просит код из приложения', () => {
    render(<TotpForm onSubmit={vi.fn()} />);

    expect(screen.getByLabelText('Код из приложения')).toBeInTheDocument();
  });

  it('передаёт введённый код', async () => {
    const onSubmit = vi.fn();
    render(<TotpForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Код из приложения'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));

    expect(onSubmit).toHaveBeenCalledWith('123456');
  });

  it('не отправляет код короче шести цифр', async () => {
    const onSubmit = vi.fn();
    render(<TotpForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Код из приложения'), '12345');
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('не принимает буквы', async () => {
    render(<TotpForm onSubmit={vi.fn()} />);

    const field = screen.getByLabelText('Код из приложения');
    await userEvent.type(field, '12ab34');

    expect(field).toHaveValue('1234');
  });

  it('показывает ошибку', () => {
    render(<TotpForm onSubmit={vi.fn()} error="Неверный код" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Неверный код');
  });

  it('подсказывает, что делать при утере устройства', () => {
    // Тупик «потерял телефон» должен разрешаться без обращения к разработчику.
    render(<TotpForm onSubmit={vi.fn()} />);

    expect(screen.getByText(/администратор/i)).toBeInTheDocument();
  });
});
