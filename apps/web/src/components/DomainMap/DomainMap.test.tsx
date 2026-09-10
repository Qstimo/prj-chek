import {
  StatusIndicator,
  StatusWarningKind,
  type DomainMap as DomainMapData,
} from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { DomainMap } from './DomainMap';

const DOMAIN_ID = '11111111-1111-1111-1111-111111111111';
const PROJECT_ID = '22222222-2222-2222-2222-222222222222';

const MAP: DomainMapData = {
  domains: [
    {
      id: DOMAIN_ID,
      name: 'example.com',
      owner: 'ООО Ромашка',
      indicator: StatusIndicator.Warning,
      paidUntil: '2026-09-20',
      warnings: [
        {
          kind: StatusWarningKind.DomainRenewalExpiring,
          subject: 'example.com',
          detail: 'оплачен до 2026-09-20',
        },
      ],
    },
  ],
  projects: [{ id: PROJECT_ID, name: 'Витрина', indicator: StatusIndicator.Warning }],
  edges: [
    {
      domainId: DOMAIN_ID,
      projectId: PROJECT_ID,
      subdomains: [{ id: '33333333-3333-3333-3333-333333333333', name: 'stage.example.com' }],
    },
  ],
};

describe('карта доменов', () => {
  it('узлы называются доменами и проектами', () => {
    render(<DomainMap map={MAP} />);

    expect(
      screen.getByRole('button', { name: 'Домен example.com, предупреждение' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Проект Витрина, предупреждение' }),
    ).toBeInTheDocument();
  });

  it('выделение корня открывает панель с владельцем и поддоменами', async () => {
    render(<DomainMap map={MAP} />);

    await userEvent.click(screen.getByRole('button', { name: /Домен example\.com/ }));

    const panel = screen.getByRole('complementary');

    expect(panel).toHaveTextContent('ООО Ромашка');
    expect(panel).toHaveTextContent('stage.example.com');
    expect(panel).toHaveTextContent('оплачен до 2026-09-20');
  });

  it('подсвечивает рёбра выделенного узла', async () => {
    render(<DomainMap map={MAP} />);

    await userEvent.click(screen.getByRole('button', { name: /Домен example\.com/ }));

    expect(screen.getByTestId(`edge-${DOMAIN_ID}-${PROJECT_ID}`)).toHaveAttribute(
      'data-active',
      'true',
    );
  });

  it('пустая карта объясняет, почему она пуста', () => {
    render(<DomainMap map={{ domains: [], projects: [], edges: [] }} />);

    expect(screen.getByText('Ни один домен не привязан к окружению.')).toBeInTheDocument();
  });
});
