import { StatusWarningKind } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WarningTone } from './types';
import { WarningsPanel } from './WarningsPanel';

const warnings = [
  {
    kind: StatusWarningKind.DomainExpiring,
    subject: 'example.com',
    detail: 'домен истекает 2026-09-20',
  },
  { kind: StatusWarningKind.HealthDown, subject: 'Прод', detail: 'HTTP 500' },
];

describe('WarningsPanel', () => {
  it('перечисляет предупреждения с темой и подробностью', () => {
    render(<WarningsPanel warnings={warnings} />);

    expect(screen.getByText(/example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/домен истекает 2026-09-20/)).toBeInTheDocument();
    expect(screen.getByText(/Прод/)).toBeInTheDocument();
  });

  it('без предупреждений не рисует ничего', () => {
    const { container } = render(<WarningsPanel warnings={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('показывает переданный заголовок', () => {
    render(<WarningsPanel title="Не отвечает" tone={WarningTone.Critical} warnings={warnings} />);

    expect(screen.getByRole('heading', { name: 'Не отвечает' })).toBeInTheDocument();
  });

  it('делает строку ссылкой, когда адрес задан', () => {
    render(<WarningsPanel warnings={[{ ...warnings[0]!, href: '/projects/1/infrastructure' }]} />);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/projects/1/infrastructure');
  });

  it('оставляет строку текстом без адреса', () => {
    render(<WarningsPanel warnings={warnings} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
