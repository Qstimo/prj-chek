import { StatusIndicator, type ServerRow } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ServerList } from './ServerList';

const server: ServerRow = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'hetzner-fsn-1',
  owner: 'ООО Ромашка',
  host: 'fsn1.example.com',
  ip: '203.0.113.10',
  provider: 'Hetzner',
  specs: '4 vCPU, 8 ГБ',
  paidUntil: '2027-01-12',
  notes: null,
  indicator: StatusIndicator.Ok,
  warnings: [],
  projectCount: 2,
  environmentCount: 3,
  createdAt: '2026-09-10T10:00:00.000Z',
  updatedAt: '2026-09-10T10:00:00.000Z',
};

const onDelete = vi.fn();

describe('реестр серверов', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('показывает имя, владельца и сколько проектов на машине', () => {
    render(<ServerList servers={[server]} onDelete={onDelete} />);

    expect(screen.getByText('hetzner-fsn-1')).toBeInTheDocument();
    expect(screen.getByText('ООО Ромашка')).toBeInTheDocument();
    expect(screen.getByText('2 проекта')).toBeInTheDocument();
  });

  it('показывает индикатор и срок оплаты', () => {
    render(<ServerList servers={[server]} onDelete={onDelete} />);

    expect(screen.getByText('В порядке')).toBeInTheDocument();
    expect(screen.getByText('Оплачен до 12.01.2027')).toBeInTheDocument();
  });

  it('ведёт на правку сервера', () => {
    render(<ServerList servers={[server]} onDelete={onDelete} />);

    expect(screen.getByRole('link', { name: 'hetzner-fsn-1' })).toHaveAttribute(
      'href',
      `/servers/${server.id}/edit`,
    );
  });

  it('пустой реестр объясняет, что серверов нет', () => {
    render(<ServerList servers={[]} onDelete={onDelete} />);

    expect(screen.getByText('Серверов пока нет.')).toBeInTheDocument();
  });

  it('удаляет только после подтверждения', async () => {
    // Браузерный confirm() блокирует автоматизацию, поэтому подтверждение
    // живёт внутри интерфейса.
    render(<ServerList servers={[server]} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Да, удалить' }));

    expect(onDelete).toHaveBeenCalledWith(server.id);
  });

  it('отменённое удаление ничего не делает', async () => {
    render(<ServerList servers={[server]} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
