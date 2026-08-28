import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Markdown } from './Markdown';

describe('Markdown', () => {
  it('рендерит заголовки и абзацы', () => {
    render(<Markdown content={'# Развёртывание\n\nШаги ниже.'} />);

    expect(screen.getByRole('heading', { name: 'Развёртывание' })).toBeInTheDocument();
    expect(screen.getByText('Шаги ниже.')).toBeInTheDocument();
  });

  it('рендерит кодовый блок как текст', () => {
    render(<Markdown content={'```\npnpm install\n```'} />);

    expect(screen.getByText('pnpm install')).toBeInTheDocument();
  });

  it('делает http-ссылку ссылкой с безопасными атрибутами', () => {
    render(<Markdown content={'[дока](https://example.com)'} />);

    const link = screen.getByRole('link', { name: 'дока' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('javascript-ссылка не становится ссылкой', () => {
    render(<Markdown content={'[клик](javascript:alert(1))'} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('html в тексте остаётся текстом', () => {
    render(<Markdown content={'<script>alert(1)</script>'} />);

    expect(screen.getByText(/<script>/)).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });
});
