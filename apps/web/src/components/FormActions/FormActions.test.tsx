import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FormActions } from './FormActions';

describe('FormActions', () => {
  it('прилипает к низу панели и перекрывает её отступ', () => {
    // Форма паспорта длиннее экрана, и кнопка внизу документа заставляла
    // бы прокручивать до конца, чтобы сохранить.
    render(<FormActions submitLabel="Сохранить" canSubmit />);

    const bar = screen.getByRole('button', { name: 'Сохранить' }).parentElement;

    expect(bar).toHaveClass('sticky');
    expect(bar).toHaveClass('bottom-0');
    // Отрицательные поля гасят внутренний отступ панели: иначе полоса
    // не доставала бы до её краёв и висела бы в воздухе.
    expect(bar).toHaveClass('-mx-6');
    expect(bar).toHaveClass('-mb-6');
    // Фон непрозрачный: под полосой проходит содержимое формы.
    expect(bar).toHaveClass('bg-background');
  });

  it('вложенная форма не прилипает', () => {
    // Две полосы спорили бы за одно место внизу панели.
    render(<FormActions submitLabel="Сохранить" canSubmit isSticky={false} />);

    expect(screen.getByRole('button', { name: 'Сохранить' }).parentElement).not.toHaveClass(
      'sticky',
    );
  });

  it('показывает отмену только когда есть куда возвращаться', async () => {
    const onCancel = vi.fn();

    const { rerender } = render(<FormActions submitLabel="Сохранить" canSubmit />);

    expect(screen.queryByRole('button', { name: 'Отмена' })).not.toBeInTheDocument();

    rerender(<FormActions submitLabel="Сохранить" canSubmit onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(onCancel).toHaveBeenCalled();
  });

  it('блокирует отправку и показывает отказ рядом с кнопкой', () => {
    render(<FormActions submitLabel="Сохранить" canSubmit={false} error="Имя занято" />);

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
    expect(screen.getByText('Имя занято')).toBeInTheDocument();
  });

  it('во время отправки говорит об этом подписью', () => {
    render(<FormActions submitLabel="Сохранить" canSubmit={false} isSubmitting />);

    expect(screen.getByRole('button', { name: 'Сохранение…' })).toBeInTheDocument();
  });
});
