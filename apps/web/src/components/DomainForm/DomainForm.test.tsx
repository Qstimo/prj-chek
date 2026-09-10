import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DomainForm } from './DomainForm';
import type { DomainFormValues } from './types';

const EMPTY: DomainFormValues = {
  name: '',
  owner: null,
  registrar: null,
  paidUntil: null,
  notes: null,
};

describe('форма корневого домена', () => {
  it('без имени отправить нельзя', () => {
    render(<DomainForm initial={EMPTY} onSubmit={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });

  it('приводит имя к нижнему регистру и обрезает края', async () => {
    const onSubmit = vi.fn();
    render(<DomainForm initial={EMPTY} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Домен'), '  Example.COM ');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'example.com', owner: null }),
    );
  });

  it('отдаёт владельца, регистратора и срок', async () => {
    const onSubmit = vi.fn();
    render(<DomainForm initial={{ ...EMPTY, name: 'example.com' }} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Владелец'), 'ООО Ромашка');
    await userEvent.type(screen.getByLabelText('Регистратор'), 'REG.RU');
    await userEvent.type(screen.getByLabelText('Оплачен до'), '2027-01-12');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'ООО Ромашка',
        registrar: 'REG.RU',
        paidUntil: '2027-01-12',
      }),
    );
  });

  it('у заведённого корня имя не правится', () => {
    // За именем висят поддомены: смена корня разорвала бы связь молча.
    render(
      <DomainForm initial={{ ...EMPTY, name: 'example.com' }} onSubmit={vi.fn()} isNameLocked />,
    );

    expect(screen.queryByLabelText('Домен')).not.toBeInTheDocument();
    expect(screen.getByText('Домен: example.com')).toBeInTheDocument();
  });

  it('показывает отказ сервера', () => {
    render(<DomainForm initial={EMPTY} onSubmit={vi.fn()} error="Домен уже есть в реестре." />);

    expect(screen.getByRole('alert')).toHaveTextContent('Домен уже есть в реестре.');
  });
});
