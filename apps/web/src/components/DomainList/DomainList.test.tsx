import { EnvironmentKind, StatusIndicator, type DomainRow } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainList } from './DomainList';

const PROJECT_ID = '22222222-2222-4222-8222-222222222222';

const subdomain = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'api.example.com',
  environmentId: '44444444-4444-4444-8444-444444444444',
  environmentName: 'Прод',
  environmentKind: EnvironmentKind.Production,
  projectId: PROJECT_ID,
  projectName: 'Лавка',
};

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
  subdomains: [subdomain],
};

const bare: DomainRow = { ...domain, subdomainCount: 0, projectCount: 0, subdomains: [] };

const onDelete = vi.fn();
const onDeleteSubdomain = vi.fn();

describe('реестр доменов', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('показывает имя, владельца и регистратора', () => {
    render(<DomainList domains={[domain]} onDelete={onDelete} onDeleteSubdomain={onDeleteSubdomain} />);

    // Корень повторяется в именах поддоменов, поэтому ищем именно ссылку.
    expect(screen.getByRole('link', { name: 'example.com' })).toBeInTheDocument();
    expect(screen.getByText('ООО Ромашка')).toBeInTheDocument();
    expect(screen.getByText('REG.RU')).toBeInTheDocument();
  });

  it('считает поддомены и проекты', () => {
    render(<DomainList domains={[domain]} onDelete={onDelete} onDeleteSubdomain={onDeleteSubdomain} />);

    expect(screen.getByText('3 поддомена · 2 проекта')).toBeInTheDocument();
  });

  it('срок показывается с доменным порогом', () => {
    // У домена месяц, а не две недели: за 25 дней плашка уже горит.
    const soon = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    render(<DomainList
      domains={[{ ...domain, paidUntil: soon }]}
      onDelete={onDelete}
      onDeleteSubdomain={onDeleteSubdomain}
    />);

    expect(screen.getByTestId('paid-until')).toHaveAttribute('data-state', 'soon');
  });

  it('ведёт на правку корня', () => {
    render(<DomainList domains={[domain]} onDelete={onDelete} onDeleteSubdomain={onDeleteSubdomain} />);

    expect(screen.getByRole('link', { name: 'example.com' })).toHaveAttribute(
      'href',
      `/domains/${domain.id}/edit`,
    );
  });

  it('пустой реестр объясняет, откуда берутся домены', () => {
    render(<DomainList domains={[]} onDelete={onDelete} onDeleteSubdomain={onDeleteSubdomain} />);

    expect(screen.getByText(/появятся сами/)).toBeInTheDocument();
    expect(screen.getByText(/завести адрес здесь/)).toBeInTheDocument();
  });

  it('удаляет только после подтверждения', async () => {
    render(<DomainList domains={[domain]} onDelete={onDelete} onDeleteSubdomain={onDeleteSubdomain} />);

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Да, удалить' }));

    expect(onDelete).toHaveBeenCalledWith(domain.id);
  });

  it('показывает поддомены под их корнем без раскрытия', () => {
    render(
      <DomainList domains={[domain]} onDelete={onDelete} onDeleteSubdomain={onDeleteSubdomain} />,
    );

    expect(screen.getByText('api.')).toBeInTheDocument();
  });

  it('ведёт с поддомена в его проект', () => {
    render(
      <DomainList domains={[domain]} onDelete={onDelete} onDeleteSubdomain={onDeleteSubdomain} />,
    );

    expect(screen.getByRole('link', { name: 'Лавка' })).toHaveAttribute(
      'href',
      `/projects/${PROJECT_ID}`,
    );
  });

  it('ведёт с окружения в инфраструктуру проекта', () => {
    render(
      <DomainList domains={[domain]} onDelete={onDelete} onDeleteSubdomain={onDeleteSubdomain} />,
    );

    expect(screen.getByRole('link', { name: 'Прод' })).toHaveAttribute(
      'href',
      `/projects/${PROJECT_ID}/infrastructure`,
    );
  });

  it('корень без поддоменов остаётся одной строкой', () => {
    render(
      <DomainList domains={[bare]} onDelete={onDelete} onDeleteSubdomain={onDeleteSubdomain} />,
    );

    expect(screen.getAllByRole('list')).toHaveLength(1);
  });

  it('убирает поддомен только после подтверждения', async () => {
    render(
      <DomainList domains={[domain]} onDelete={onDelete} onDeleteSubdomain={onDeleteSubdomain} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Убрать api.example.com' }));

    expect(onDeleteSubdomain).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Да, удалить' }));

    expect(onDeleteSubdomain).toHaveBeenCalledWith(subdomain);
  });
});
