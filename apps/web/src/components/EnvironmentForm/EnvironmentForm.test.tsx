import { EnvironmentKind } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EnvironmentForm } from './EnvironmentForm';

const initial = {
  name: '',
  kind: EnvironmentKind.Production,
  serverId: null,
  serverName: null,
  healthCheckPath: null,
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

  it('отправляет заполненные поля, а адрес — доменом', async () => {
    // Отдельного поля адреса нет: домен и есть адрес, и только он попадает
    // в реестр корней и под проверки сертификата и срока продления.
    const onSubmit = vi.fn();
    render(<EnvironmentForm initial={initial} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Название'), 'Прод');
    await userEvent.type(screen.getByLabelText('Домены'), 'prod.example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить домен' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Прод', domains: ['prod.example.com'] }),
    );
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('host');
  });

  it('спрашивает путь проверки, а не адрес', async () => {
    // Полный URL был вторым местом для адреса — тем самым, из-за которого
    // статус расходился с доменами окружения.
    const onSubmit = vi.fn();
    render(<EnvironmentForm initial={initial} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Название'), 'Прод');
    await userEvent.type(screen.getByLabelText('Путь проверки'), '/api/health');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ healthCheckPath: '/api/health' }),
    );
    expect(screen.queryByLabelText('Адрес проверки')).not.toBeInTheDocument();
  });

  it('объясняет, что адресом служат домены', () => {
    render(<EnvironmentForm initial={initial} onSubmit={vi.fn()} />);

    expect(screen.getByText(/адресами служат домены/i)).toBeInTheDocument();
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
      // Боевой путь: реестр машин подрядчику не отдаётся вовсе, поэтому
      // список пуст — имя приходит вместе с самим окружением.
      render(
        <EnvironmentForm
          initial={{ ...initial, serverId: SERVERS[0]!.id, serverName: 'hetzner-fsn-1' }}
          onSubmit={vi.fn()}
          servers={[]}
        />,
      );

      expect(screen.getByText('Сервер: hetzner-fsn-1')).toBeInTheDocument();
    });

    it('без привязки говорит об этом прямо', () => {
      render(<EnvironmentForm initial={initial} onSubmit={vi.fn()} servers={[]} />);

      expect(screen.getByText('Сервер не привязан')).toBeInTheDocument();
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

  describe('известные адреса', () => {
    it('передаёт список в поле доменов', async () => {
      render(
        <EnvironmentForm
          initial={initial}
          onSubmit={vi.fn()}
          knownDomains={['api.example.com']}
        />,
      );

      await userEvent.type(screen.getByLabelText('Домены'), 'api');

      expect(screen.getByRole('option', { name: 'api.example.com' })).toBeInTheDocument();
    });

    it('без списка поле остаётся вводом текста', async () => {
      // Список известных адресов раскрыл бы подрядчику чужие адреса,
      // а через них — существование чужих проектов.
      render(<EnvironmentForm initial={initial} onSubmit={vi.fn()} />);

      await userEvent.type(screen.getByLabelText('Домены'), 'api');

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });
});
