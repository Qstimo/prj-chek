import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChronicleForm } from './ChronicleForm';

const initial = {
  occurredOn: '2026-08-27',
  title: '',
  content: '',
};

describe('ChronicleForm', () => {
  it('не отправляет форму без заголовка и содержимого', async () => {
    const onSubmit = vi.fn();
    render(<ChronicleForm initial={initial} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('отправляет заполненную запись', async () => {
    const onSubmit = vi.fn();
    render(<ChronicleForm initial={initial} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Заголовок'), 'Встреча');
    await userEvent.type(screen.getByLabelText('Содержимое'), 'Сводка встречи');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith({
      occurredOn: '2026-08-27',
      title: 'Встреча',
      content: 'Сводка встречи',
    });
  });

  it('даёт поменять дату события', async () => {
    const onSubmit = vi.fn();
    render(<ChronicleForm initial={initial} onSubmit={onSubmit} />);

    const dateField = screen.getByLabelText('Дата события');
    await userEvent.clear(dateField);
    await userEvent.type(dateField, '2026-08-20');
    await userEvent.type(screen.getByLabelText('Заголовок'), 'Встреча');
    await userEvent.type(screen.getByLabelText('Содержимое'), 'Сводка');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ occurredOn: '2026-08-20' }));
  });

  it('показывает ошибку сервера', () => {
    render(<ChronicleForm initial={initial} onSubmit={vi.fn()} error="Не сохранилось" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Не сохранилось');
  });
});
