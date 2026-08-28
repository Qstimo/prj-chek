import { EnvironmentKind } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EnvironmentForm } from './EnvironmentForm';

const initial = {
  name: '',
  kind: EnvironmentKind.Production,
  host: null,
  ip: null,
  provider: null,
  specs: null,
  healthCheckUrl: null,
  notes: null,
  domains: [],
};

describe('EnvironmentForm', () => {
  it('не отправляет форму без имени', async () => {
    const onSubmit = vi.fn();
    render(<EnvironmentForm initial={initial} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('отправляет заполненные поля', async () => {
    const onSubmit = vi.fn();
    render(<EnvironmentForm initial={initial} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Название'), 'Прод');
    await userEvent.type(screen.getByLabelText('IP-адрес'), '203.0.113.10');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Прод', ip: '203.0.113.10' }),
    );
  });

  it('превращает пустые поля в отсутствие значения', async () => {
    // Пустая строка и «не заполнено» — разные вещи: контракт ждёт null.
    const onSubmit = vi.fn();
    render(<EnvironmentForm initial={initial} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Название'), 'Прод');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ provider: null }));
  });

  it('показывает ошибку сервера', () => {
    render(<EnvironmentForm initial={initial} onSubmit={vi.fn()} error="Имя занято" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Имя занято');
  });
});
