import { EnvironmentKind } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EnvironmentCard } from './EnvironmentCard';

const metadata = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Прод',
  kind: EnvironmentKind.Production,
  domains: ['example.com'],
};

const detail = {
  ...metadata,
  host: 'srv-1.example.com',
  ip: '203.0.113.10',
  provider: 'Hetzner',
  specs: '2 vCPU, 4 ГБ',
  healthCheckUrl: 'https://example.com/health',
  notes: 'Заметка',
  createdAt: '2026-08-27T10:00:00.000Z',
  updatedAt: '2026-08-27T10:00:00.000Z',
};

describe('EnvironmentCard', () => {
  it('показывает имя, вид и домены', () => {
    render(<EnvironmentCard environment={metadata} />);

    expect(screen.getByText('Прод')).toBeInTheDocument();
    expect(screen.getByText('Продакшен')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('на уровне метаданных не показывает серверные параметры', () => {
    // Их отсутствие в ответе — это и есть уровень доступа; показывать
    // «скрыто» здесь не нужно, секция сама объясняет ограничение.
    render(<EnvironmentCard environment={metadata} />);

    expect(screen.queryByText(/203\.0\.113\.10/)).not.toBeInTheDocument();
  });

  it('на уровне чтения показывает серверные параметры', () => {
    render(<EnvironmentCard environment={detail} />);

    expect(screen.getByText('203.0.113.10')).toBeInTheDocument();
    expect(screen.getByText('Hetzner')).toBeInTheDocument();
  });

  it('без права записи не показывает кнопок', () => {
    render(<EnvironmentCard environment={detail} />);

    expect(screen.queryByRole('button', { name: 'Править' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить' })).not.toBeInTheDocument();
  });

  it('с правом записи вызывает правку', async () => {
    const onEdit = vi.fn();
    render(<EnvironmentCard environment={detail} canWrite onEdit={onEdit} onDelete={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Править' }));

    expect(onEdit).toHaveBeenCalled();
  });

  it('удаление требует подтверждения', async () => {
    // Браузерный диалог заблокировал бы страницу, поэтому подтверждение
    // спрашивается на месте.
    const onDelete = vi.fn();
    render(<EnvironmentCard environment={detail} canWrite onEdit={vi.fn()} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));
    expect(onDelete).toHaveBeenCalled();
  });

  it('отменяет удаление', async () => {
    const onDelete = vi.fn();
    render(<EnvironmentCard environment={detail} canWrite onEdit={vi.fn()} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Удалить' })).toBeInTheDocument();
  });
});
