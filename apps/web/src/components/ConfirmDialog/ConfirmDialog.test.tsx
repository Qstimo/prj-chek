import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('находится по роли и подписи', () => {
    render(
      <ConfirmDialog
        label="Подтверждение закрытия"
        confirmLabel="Закрыть"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      >
        Изменения будут потеряны.
      </ConfirmDialog>,
    );

    expect(screen.getByRole('dialog', { name: 'Подтверждение закрытия' })).toBeInTheDocument();
    expect(screen.getByText('Изменения будут потеряны.')).toBeInTheDocument();
  });

  it('подтверждение зовёт onConfirm', async () => {
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        label="Подтверждение"
        confirmLabel="Да, убрать"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      >
        Вопрос
      </ConfirmDialog>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Да, убрать' }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('отмена зовёт onCancel и не зовёт подтверждение', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        label="Подтверждение"
        confirmLabel="Да"
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        Вопрос
      </ConfirmDialog>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
