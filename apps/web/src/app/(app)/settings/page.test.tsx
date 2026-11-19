import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Page from './page';

// Содержимое блока проверяется своим файлом: здесь важно, что у блока
// есть собственный заголовок, а не то, что внутри него.
vi.mock('./ModelServicesScreen', () => ({
  ModelServicesScreen: () => <div data-testid="services" />,
}));

describe('Страница настроек', () => {
  it('называет себя «Настройки», а службы модели — блоком внутри', () => {
    // Страница заведена как место для настроек, а не как обёртка одного
    // блока: следующая настройка поедет сюда, а не восьмым пунктом в
    // полосу навигации (дизайн, 5.1).
    render(<Page />);

    expect(screen.getByRole('heading', { level: 1, name: 'Настройки' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Службы модели' })).toBeInTheDocument();
    expect(screen.getByTestId('services')).toBeInTheDocument();
  });
});
