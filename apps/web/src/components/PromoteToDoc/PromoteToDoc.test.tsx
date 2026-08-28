import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PromoteToDoc } from './PromoteToDoc';

describe('PromoteToDoc', () => {
  it('предзаполняет страницу записью хроники', () => {
    render(
      <PromoteToDoc
        entryTitle="Сводка встречи"
        entryContent="Решили выпускать в пятницу."
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Заголовок')).toHaveValue('Сводка встречи');
    expect(screen.getByLabelText('Содержимое')).toHaveValue('Решили выпускать в пятницу.');
  });

  it('отправляет страницу и умеет отменяться', async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(
      <PromoteToDoc
        entryTitle="Сводка"
        entryContent="Содержимое"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(onSubmit).toHaveBeenCalledWith({ title: 'Сводка', content: 'Содержимое' });

    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
