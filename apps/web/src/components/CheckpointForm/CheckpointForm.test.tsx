import { PlatformKind, type Platform } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CheckpointForm } from './CheckpointForm';

describe('CheckpointForm', () => {
  it('не отправляет пустую формулировку', async () => {
    const onSubmit = vi.fn();
    render(<CheckpointForm onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('отправляет формулировку и очищает поле', async () => {
    const onSubmit = vi.fn();
    render(<CheckpointForm onSubmit={onSubmit} />);

    const field = screen.getByLabelText('Формулировка');
    await userEvent.type(field, 'Готов вход');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(onSubmit).toHaveBeenCalledWith({ title: 'Готов вход', url: null });
    expect(field).toHaveValue('');
  });

  it('поддерживает предзаполнение', () => {
    render(<CheckpointForm initial={{ title: 'Из хроники' }} onSubmit={vi.fn()} />);

    expect(screen.getByLabelText('Формулировка')).toHaveValue('Из хроники');
  });

  it('показывает отказ сервера, а не молчит', () => {
    render(<CheckpointForm onSubmit={vi.fn()} error="Формулировка: заполните поле" />);

    expect(screen.getByRole('alert')).toHaveTextContent('заполните поле');
  });

  it('даёт полю семь строк высоты', () => {
    render(<CheckpointForm onSubmit={vi.fn()} />);

    expect(screen.getByLabelText('Формулировка')).toHaveAttribute('rows', '7');
  });

  it('отправляет по Ctrl+Enter', async () => {
    const onSubmit = vi.fn();
    render(<CheckpointForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Формулировка'), 'Перевести биллинг');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    expect(onSubmit).toHaveBeenCalledWith({ title: 'Перевести биллинг', url: null });
  });

  it('не отправляет пустую формулировку по Ctrl+Enter', async () => {
    const onSubmit = vi.fn();
    render(<CheckpointForm onSubmit={onSubmit} />);

    await userEvent.click(screen.getByLabelText('Формулировка'));
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('отправляет ссылку вместе с формулировкой', async () => {
    const onSubmit = vi.fn();
    render(<CheckpointForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Формулировка'), 'Перевести биллинг');
    await userEvent.type(
      screen.getByLabelText('Ссылка на задачу'),
      'https://tracker.example.com/TASK-17',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Перевести биллинг',
      url: 'https://tracker.example.com/TASK-17',
    });
  });

  it('подставляет заголовок в пустую формулировку', async () => {
    render(<CheckpointForm onSubmit={vi.fn()} onReadTitle={async () => 'Перевести биллинг'} />);

    await userEvent.type(
      screen.getByLabelText('Ссылка на задачу'),
      'https://tracker.example.com/TASK-17',
    );
    await userEvent.tab();

    expect(await screen.findByDisplayValue('Перевести биллинг')).toBeInTheDocument();
  });

  it('не затирает уже написанную формулировку', async () => {
    const onReadTitle = vi.fn(async () => 'Из трекера');
    render(<CheckpointForm onSubmit={vi.fn()} onReadTitle={onReadTitle} />);

    await userEvent.type(screen.getByLabelText('Формулировка'), 'Своя формулировка');
    await userEvent.type(
      screen.getByLabelText('Ссылка на задачу'),
      'https://tracker.example.com/TASK-17',
    );
    await userEvent.tab();

    expect(screen.getByLabelText('Формулировка')).toHaveValue('Своя формулировка');
    expect(onReadTitle).not.toHaveBeenCalled();
  });

  it('молчит, когда заголовок прочитать не удалось', async () => {
    render(<CheckpointForm onSubmit={vi.fn()} onReadTitle={async () => null} />);

    await userEvent.type(
      screen.getByLabelText('Ссылка на задачу'),
      'https://tracker.example.com/TASK-17',
    );
    await userEvent.tab();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Формулировка')).toHaveValue('');
  });

  it('молчит, когда чтение заголовка сорвалось', async () => {
    render(
      <CheckpointForm onSubmit={vi.fn()} onReadTitle={async () => Promise.reject(new Error('сеть'))} />,
    );

    await userEvent.type(
      screen.getByLabelText('Ссылка на задачу'),
      'https://tracker.example.com/TASK-17',
    );
    await userEvent.tab();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('не ходит за заголовком без ссылки', async () => {
    const onReadTitle = vi.fn(async () => 'Из трекера');
    render(<CheckpointForm onSubmit={vi.fn()} onReadTitle={onReadTitle} />);

    await userEvent.click(screen.getByLabelText('Ссылка на задачу'));
    await userEvent.tab();

    expect(onReadTitle).not.toHaveBeenCalled();
  });

  const API: Platform = { id: 'p1', kind: PlatformKind.Server, name: 'API', position: 1 };
  const STORE: Platform = { id: 'p2', kind: PlatformKind.Store, name: 'App Store', position: 2 };

  it('отправляет выбранные платформы с новым чекпоинтом', async () => {
    const onSubmit = vi.fn();

    render(<CheckpointForm onSubmit={onSubmit} platforms={[API, STORE]} />);

    await userEvent.type(screen.getByLabelText('Формулировка'), 'Вход по телефону');
    await userEvent.click(screen.getByLabelText('App Store'));
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ platformIds: ['p2'] }));
  });

  it('без платформ проекта переключателей нет', () => {
    render(<CheckpointForm onSubmit={vi.fn()} />);

    expect(screen.queryByText('Платформы')).not.toBeInTheDocument();
  });

  it('предзаполняется для правки и зовёт кнопку «Сохранить»', () => {
    render(
      <CheckpointForm
        initial={{ title: 'Оплата', url: 'https://tracker.example.com/1', platformIds: ['p1'] }}
        submitLabel="Сохранить"
        platforms={[API]}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Формулировка')).toHaveValue('Оплата');
    expect(screen.getByLabelText('Ссылка на задачу')).toHaveValue('https://tracker.example.com/1');
    expect(screen.getByLabelText('API')).toBeChecked();
  });
});
