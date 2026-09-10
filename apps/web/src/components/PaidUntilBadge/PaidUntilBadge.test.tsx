import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PaidUntilBadge } from './PaidUntilBadge';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Календарный день через `days` суток от сегодня в формате контракта. */
function inDays(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
}

describe('плашка срока оплаты', () => {
  it('без срока сообщает, что он не указан', () => {
    render(<PaidUntilBadge paidUntil={null} />);

    expect(screen.getByText('Срок оплаты не указан')).toBeInTheDocument();
  });

  it('далёкий срок показывает датой по-русски', () => {
    render(<PaidUntilBadge paidUntil="2027-01-12" />);

    expect(screen.getByText('Оплачен до 12.01.2027')).toBeInTheDocument();
  });

  it('близкий срок добавляет, сколько осталось', () => {
    render(<PaidUntilBadge paidUntil={inDays(3)} />);

    expect(screen.getByText(/через 3 дня/)).toBeInTheDocument();
  });

  it('прошедший срок сообщает о просрочке', () => {
    render(<PaidUntilBadge paidUntil={inDays(-5)} />);

    expect(screen.getByText(/оплата истекла 5 дней назад/i)).toBeInTheDocument();
  });

  it('состояние помечено не только цветом', () => {
    // Цвет не единственный носитель смысла: рядом обязателен текст.
    const { rerender } = render(<PaidUntilBadge paidUntil={inDays(3)} />);

    expect(screen.getByTestId('paid-until')).toHaveAttribute('data-state', 'soon');

    rerender(<PaidUntilBadge paidUntil={inDays(-1)} />);
    expect(screen.getByTestId('paid-until')).toHaveAttribute('data-state', 'expired');

    rerender(<PaidUntilBadge paidUntil={inDays(90)} />);
    expect(screen.getByTestId('paid-until')).toHaveAttribute('data-state', 'ok');
  });
});
