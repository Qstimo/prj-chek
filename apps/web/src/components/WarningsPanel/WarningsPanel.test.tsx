import { StatusWarningKind } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WarningsPanel } from './WarningsPanel';

describe('WarningsPanel', () => {
  it('перечисляет предупреждения с темой и подробностью', () => {
    render(
      <WarningsPanel
        warnings={[
          {
            kind: StatusWarningKind.DomainExpiring,
            subject: 'example.com',
            detail: 'домен истекает 2026-09-20',
          },
          { kind: StatusWarningKind.HealthDown, subject: 'Прод', detail: 'HTTP 500' },
        ]}
      />,
    );

    expect(screen.getByText(/example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/домен истекает 2026-09-20/)).toBeInTheDocument();
    expect(screen.getByText(/Прод/)).toBeInTheDocument();
  });

  it('без предупреждений не рисует ничего', () => {
    const { container } = render(<WarningsPanel warnings={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
