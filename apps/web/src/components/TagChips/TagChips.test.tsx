import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TagChips } from './TagChips';

describe('TagChips', () => {
  it('показывает названия тегов и ничего не предлагает убрать', () => {
    render(
      <TagChips
        tags={[
          { slug: 'web', label: 'Web' },
          { slug: 'product', label: 'Product' },
        ]}
      />,
    );

    expect(screen.getByText('Web')).toBeInTheDocument();
    expect(screen.getByText('Product')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('без тегов не рисует ничего', () => {
    const { container } = render(<TagChips tags={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
