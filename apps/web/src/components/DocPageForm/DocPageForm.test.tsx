import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DocPageForm } from './DocPageForm';

describe('DocPageForm', () => {
  it('не отправляет форму без заголовка или содержимого', async () => {
    const onSubmit = vi.fn();
    render(<DocPageForm onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Заголовок'), 'Развёртывание');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('отправляет заголовок и содержимое', async () => {
    const onSubmit = vi.fn();
    render(<DocPageForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Заголовок'), 'Развёртывание');
    await userEvent.type(screen.getByLabelText('Содержимое'), '# Шаги');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith({ title: 'Развёртывание', content: '# Шаги' });
  });

  it('поддерживает предзаполнение при правке', () => {
    render(
      <DocPageForm initial={{ title: 'Старая', content: 'Текст' }} onSubmit={vi.fn()} />,
    );

    expect(screen.getByLabelText('Заголовок')).toHaveValue('Старая');
    expect(screen.getByLabelText('Содержимое')).toHaveValue('Текст');
  });

  it('показывает ошибку сервера', () => {
    render(<DocPageForm onSubmit={vi.fn()} error="Заголовок занят" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Заголовок занят');
  });
});
