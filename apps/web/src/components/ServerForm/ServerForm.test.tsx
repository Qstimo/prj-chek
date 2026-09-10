import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ServerForm } from './ServerForm';
import type { ServerFormValues } from './types';

const EMPTY: ServerFormValues = {
  name: '',
  owner: null,
  host: null,
  ip: null,
  provider: null,
  specs: null,
  paidUntil: null,
  notes: null,
};

describe('форма сервера', () => {
  it('без имени отправить нельзя', () => {
    render(<ServerForm initial={EMPTY} onSubmit={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });

  it('отдаёт заполненные поля и приводит пустые к отсутствию', async () => {
    const onSubmit = vi.fn();
    render(<ServerForm initial={EMPTY} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Название'), '  hetzner-fsn-1 ');
    await userEvent.type(screen.getByLabelText('Владелец'), 'ООО Ромашка');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'hetzner-fsn-1',
      owner: 'ООО Ромашка',
      host: null,
      ip: null,
      provider: null,
      specs: null,
      paidUntil: null,
      notes: null,
    });
  });

  it('срок оплаты вводится календарной датой', async () => {
    const onSubmit = vi.fn();
    render(<ServerForm initial={{ ...EMPTY, name: 'srv' }} onSubmit={onSubmit} />);

    const paidUntil = screen.getByLabelText('Оплачен до');

    expect(paidUntil).toHaveAttribute('type', 'date');

    await userEvent.type(paidUntil, '2027-01-12');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ paidUntil: '2027-01-12' }));
  });

  it('показывает отказ сервера', () => {
    render(
      <ServerForm initial={EMPTY} onSubmit={vi.fn()} error="Сервер с таким именем уже есть." />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Сервер с таким именем уже есть.');
  });

  it('во время отправки кнопка заблокирована', () => {
    render(<ServerForm initial={{ ...EMPTY, name: 'srv' }} onSubmit={vi.fn()} isSubmitting />);

    expect(screen.getByRole('button', { name: 'Сохранение…' })).toBeDisabled();
  });
});
