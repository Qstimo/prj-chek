import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { IssuedLink } from './IssuedLink';

const link = { url: 'https://cairn.local/invite/token', expiresAt: '2026-01-02T10:00:00.000Z' };

describe('IssuedLink', () => {
  it('показывает адрес ссылки', () => {
    render(<IssuedLink link={link} title="Приглашение создано" />);

    expect(screen.getByText(link.url)).toBeInTheDocument();
  });

  it('предупреждает, что ссылка показывается один раз', () => {
    render(<IssuedLink link={link} title="Приглашение создано" />);

    expect(screen.getByText(/один раз/i)).toBeInTheDocument();
  });

  it('показывает срок действия', () => {
    render(<IssuedLink link={link} title="Приглашение создано" />);

    expect(screen.getByText(/02\.01\.2026/)).toBeInTheDocument();
  });
});
