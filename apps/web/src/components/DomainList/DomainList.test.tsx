import { StatusIndicator, type DomainRow } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainList } from './DomainList';

const domain: DomainRow = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'example.com',
  owner: 'ООО Ромашка',
  registrar: 'REG.RU',
  paidUntil: '2027-01-12',
  notes: null,
  indicator: StatusIndicator.Ok,
  warnings: [],
  subdomainCount: 3,
  projectCount: 2,
  createdAt: '2026-09-10T10:00:00.000Z',
  updatedAt: '2026-09-10T10:00:00.000Z',
};

const onDelete = vi.fn();

describe('реестр доменов', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('показывает имя, владельца и регистратора', () => {
    render(<DomainList domains={[domain]} onDelete={onDelete} />);

    expect(screen.getByText('example.com')).toBeInTheDocument();
    expect(screen.getByText('ООО Ромашка')).toBeInTheDocument();
    expect(screen.getByText('REG.RU')).toBeInTheDocument();
  });

  it('считает поддомены и проекты', () => {
    render(<DomainList domains={[domain]} onDelete={onDelete} />);

    expect(screen.getByText('3 поддомена · 2 проекта')).toBeInTheDocument();
  });

  it('срок показывается с доменным порогом', () => {
    // У домена месяц, а не две недели: за 25 дней плашка уже горит.
    const soon = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    render(<DomainList domains={[{ ...domain, paidUntil: soon }]} onDelete={onDelete} />);

    expect(screen.getByTestId('paid-until')).toHaveAttribute('data-state', 'soon');
  });

  it('ведёт на правку корня', () => {
    render(<DomainList domains={[domain]} onDelete={onDelete} />);

    expect(screen.getByRole('link', { name: 'example.com' })).toHaveAttribute(
      'href',
      `/domains/${domain.id}/edit`,
    );
  });

  it('пустой реестр объясняет, откуда берутся домены', () => {
    render(<DomainList domains={[]} onDelete={onDelete} />);

    expect(screen.getByText(/появятся сами/)).toBeInTheDocument();
  });

  it('удаляет только после подтверждения', async () => {
    render(<DomainList domains={[domain]} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Да, удалить' }));

    expect(onDelete).toHaveBeenCalledWith(domain.id);
  });
});
