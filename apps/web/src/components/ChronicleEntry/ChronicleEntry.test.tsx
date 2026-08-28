import { ChronicleSource } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChronicleEntry } from './ChronicleEntry';

const metadata = {
  id: '11111111-1111-1111-1111-111111111111',
  occurredOn: '2026-08-27',
  title: 'Встреча по релизу',
  source: ChronicleSource.Webhook,
};

const detail = {
  ...metadata,
  content: 'Решили выпускать в пятницу.',
  createdAt: '2026-08-27T10:00:00.000Z',
  updatedAt: '2026-08-27T10:00:00.000Z',
};

describe('ChronicleEntry', () => {
  it('показывает дату, заголовок и источник', () => {
    render(<ChronicleEntry entry={metadata} />);

    expect(screen.getByText('Встреча по релизу')).toBeInTheDocument();
    expect(screen.getByText('Webhook')).toBeInTheDocument();
    expect(screen.getByText(/27\.08\.2026/)).toBeInTheDocument();
  });

  it('на уровне метаданных не показывает содержимого', () => {
    render(<ChronicleEntry entry={metadata} />);

    expect(screen.queryByText(/пятницу/)).not.toBeInTheDocument();
  });

  it('на уровне чтения показывает содержимое', () => {
    render(<ChronicleEntry entry={detail} />);

    expect(screen.getByText('Решили выпускать в пятницу.')).toBeInTheDocument();
  });

  it('без права записи не показывает кнопок', () => {
    render(<ChronicleEntry entry={detail} />);

    expect(screen.queryByRole('button', { name: 'Править' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить' })).not.toBeInTheDocument();
  });

  it('удаление требует подтверждения', async () => {
    const onDelete = vi.fn();
    render(<ChronicleEntry entry={detail} canWrite onEdit={vi.fn()} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));
    expect(onDelete).toHaveBeenCalled();
  });

  it('отменяет удаление', async () => {
    const onDelete = vi.fn();
    render(<ChronicleEntry entry={detail} canWrite onEdit={vi.fn()} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Удалить' })).toBeInTheDocument();
  });
});
