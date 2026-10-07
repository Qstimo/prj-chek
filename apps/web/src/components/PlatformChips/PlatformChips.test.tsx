import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PlatformChips } from './PlatformChips';

const API = { id: 'p1', name: 'API' };
const STORE = { id: 'p2', name: 'App Store' };

describe('PlatformChips', () => {
  it('показывает имена платформ и ничего не предлагает убрать', () => {
    render(<PlatformChips platforms={[API, STORE]} />);

    expect(screen.getByText('API')).toBeInTheDocument();
    expect(screen.getByText('App Store')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('без платформ не рисует ничего', () => {
    const { container } = render(<PlatformChips platforms={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
