import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TotpSetup } from './TotpSetup';

const setup = { keyUri: 'otpauth://totp/CAIRN:admin', secret: 'JBSWY3DPEHPK3PXP' };

describe('TotpSetup', () => {
  it('показывает секрет для ручного ввода', () => {
    render(<TotpSetup setup={setup} onConfirm={vi.fn()} />);

    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
  });

  it('объясняет, что делать', () => {
    render(<TotpSetup setup={setup} onConfirm={vi.fn()} />);

    // Запрос по всему слову «приложени» совпал бы и с подписями формы кода,
    // поэтому проверяется именно инструкция экрана привязки.
    expect(screen.getByText(/откройте приложение-аутентификатор/i)).toBeInTheDocument();
  });

  it('передаёт код подтверждения', async () => {
    const onConfirm = vi.fn();
    render(<TotpSetup setup={setup} onConfirm={onConfirm} />);

    await userEvent.type(screen.getByLabelText('Код из приложения'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));

    expect(onConfirm).toHaveBeenCalledWith('123456');
  });

  it('не отправляет неполный код', async () => {
    const onConfirm = vi.fn();
    render(<TotpSetup setup={setup} onConfirm={onConfirm} />);

    await userEvent.type(screen.getByLabelText('Код из приложения'), '123');
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('показывает ошибку подтверждения', () => {
    render(<TotpSetup setup={setup} onConfirm={vi.fn()} error="Неверный код" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Неверный код');
  });
});
