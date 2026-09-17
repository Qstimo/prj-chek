import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SubdomainName } from './SubdomainName';

describe('SubdomainName', () => {
  it('приглушает корневую часть имени', () => {
    render(<SubdomainName name="api.example.com" root="example.com" />);

    expect(screen.getByText('api.')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toHaveClass('text-muted-foreground');
  });

  it('корень показывает целиком, без приглушения', () => {
    render(<SubdomainName name="example.com" root="example.com" />);

    expect(screen.getByText('example.com')).not.toHaveClass('text-muted-foreground');
  });

  it('оставляет адрес копируемым целиком', () => {
    // Между частями имени не должно появиться ничего, кроме самих символов:
    // иначе скопированный адрес перестанет быть адресом.
    const { container } = render(<SubdomainName name="api.example.com" root="example.com" />);

    expect(container.textContent).toBe('api.example.com');
  });

  it('имя чужой зоны показывает как есть', () => {
    // Корень мог смениться: разошедшееся имя надо показать целиком,
    // а не резать по случайному совпадению.
    render(<SubdomainName name="api.shop.co.uk" root="example.com" />);

    expect(screen.getByText('api.shop.co.uk')).toBeInTheDocument();
    expect(screen.queryByText('example.com')).not.toBeInTheDocument();
  });
});
