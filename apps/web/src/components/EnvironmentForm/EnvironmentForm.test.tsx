import { EnvironmentKind } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EnvironmentForm } from './EnvironmentForm';

const initial = {
  name: '',
  kind: EnvironmentKind.Production,
  host: null,
  serverId: null,
  healthCheckUrl: null,
  notes: null,
  domains: [],
};

const SERVERS = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'hetzner-fsn-1' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'selectel-msk-1' },
];

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
    await userEvent.type(screen.getByLabelText('Адрес окружения'), 'prod.example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Прод', host: 'prod.example.com' }),
    );
  });

  it('превращает пустые поля в отсутствие значения', async () => {
    // Пустая строка и «не заполнено» — разные вещи: контракт ждёт null.
    const onSubmit = vi.fn();
    render(<EnvironmentForm initial={initial} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Название'), 'Прод');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ notes: null }));
  });

  it('показывает ошибку сервера', () => {
    render(<EnvironmentForm initial={initial} onSubmit={vi.fn()} error="Имя занято" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Имя занято');
  });

  describe('привязка к серверу', () => {
    it('без права выбора список машин не показывается', () => {
      // Список серверов межпроектен: показать его подрядчику значило бы
      // раскрыть чужую инфраструктуру именами машин.
      render(<EnvironmentForm initial={initial} onSubmit={vi.fn()} servers={SERVERS} />);

      expect(screen.queryByLabelText('Сервер')).not.toBeInTheDocument();
    });

    it('привязанный сервер виден текстом и без права выбора', () => {
      render(
        <EnvironmentForm
          initial={{ ...initial, serverId: SERVERS[0]!.id }}
          onSubmit={vi.fn()}
          servers={SERVERS}
        />,
      );

      expect(screen.getByText('Сервер: hetzner-fsn-1')).toBeInTheDocument();
    });

    it('суперадмин выбирает сервер из списка', async () => {
      const onSubmit = vi.fn();
      render(
        <EnvironmentForm
          initial={initial}
          onSubmit={onSubmit}
          servers={SERVERS}
          canAssignServer
        />,
      );

      await userEvent.type(screen.getByLabelText('Название'), 'Прод');
      await userEvent.selectOptions(screen.getByLabelText('Сервер'), SERVERS[1]!.id);
      await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ serverId: SERVERS[1]!.id }),
      );
    });

    it('без выбранной машины отправляет отсутствие привязки', async () => {
      const onSubmit = vi.fn();
      render(
        <EnvironmentForm
          initial={initial}
          onSubmit={onSubmit}
          servers={SERVERS}
          canAssignServer
        />,
      );

      await userEvent.type(screen.getByLabelText('Название'), 'Прод');
      await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ serverId: null }));
    });
  });
});
