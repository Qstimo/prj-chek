import { StatusIndicator as Indicator } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusIndicator } from './StatusIndicator';

describe('StatusIndicator', () => {
  it('показывает подпись словом, а не только цветом', () => {
    render(<StatusIndicator indicator={Indicator.Warning} />);

    expect(screen.getByText('Предупреждение')).toBeInTheDocument();
  });

  it('помечает индикатор атрибутом для стилей', () => {
    const { container } = render(<StatusIndicator indicator={Indicator.Down} />);

    expect(container.querySelector('[data-indicator="down"]')).not.toBeNull();
  });

  it('приостановленный проект не выглядит аварией', () => {
    render(<StatusIndicator indicator={Indicator.Paused} />);

    expect(screen.getByText('Приостановлен')).toBeInTheDocument();
  });
});
