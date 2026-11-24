import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Page from './page';

// Содержимое блоков проверяется своими файлами: здесь важно, что у блока
// есть собственный заголовок, а не то, что внутри него.
vi.mock('./ModelServicesScreen', () => ({
  ModelServicesScreen: () => <div data-testid="services" />,
}));

vi.mock('./TrackerScreen', () => ({
  TrackerScreen: () => <div data-testid="tracker" />,
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

  it('трекер задач — свой блок, а не карточка среди служб модели', () => {
    // Перечни, ручки и смысл у них разные: включение трекера не говорит
    // ничего о разбивке саммари, и соседство в одном списке означало бы
    // обратное.
    render(<Page />);

    expect(screen.getByRole('heading', { level: 2, name: 'Трекер задач' })).toBeInTheDocument();
    expect(screen.getByTestId('tracker')).toBeInTheDocument();
  });
});
