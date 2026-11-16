import { SummaryTaskOrigin, type SummaryTask } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SummaryTaskEditor } from './SummaryTaskEditor';

const TASK_A: SummaryTask = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'раз',
  position: 1,
  origin: SummaryTaskOrigin.Human,
};

const TASK_B: SummaryTask = {
  id: '22222222-2222-2222-2222-222222222222',
  title: 'два',
  position: 2,
  origin: SummaryTaskOrigin.Human,
};

/** Формулировки в том порядке, в котором они показаны. */
function titles(): string[] {
  return screen.getAllByRole('textbox').map((field) => (field as HTMLInputElement).value);
}

describe('редактор черновика задач', () => {
  it('«Ниже» меняет порядок двух строк', async () => {
    render(<SummaryTaskEditor tasks={[TASK_A, TASK_B]} onSave={vi.fn()} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Ниже' })[0]!);

    expect(titles()).toEqual(['два', 'раз']);
  });

  it('«Выше» меняет порядок обратно', async () => {
    render(<SummaryTaskEditor tasks={[TASK_A, TASK_B]} onSave={vi.fn()} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Выше' })[1]!);

    expect(titles()).toEqual(['два', 'раз']);
  });

  it('перетаскивания нет: порядок меняется кнопками', () => {
    // Библиотеки DnD в проекте нет, а кнопки доступны с клавиатуры и
    // читалкой, в отличие от перетаскивания.
    render(<SummaryTaskEditor tasks={[TASK_A, TASK_B]} onSave={vi.fn()} />);

    expect(screen.getAllByRole('button', { name: 'Выше' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Ниже' })).toHaveLength(2);
  });

  it('«Удалить» убирает строку', async () => {
    render(<SummaryTaskEditor tasks={[TASK_A, TASK_B]} onSave={vi.fn()} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Удалить' })[0]!);

    expect(titles()).toEqual(['два']);
  });

  it('«Добавить задачу» добавляет пустую строку и ставит на неё фокус', async () => {
    // Работает и при выключенном предложителе: список можно набрать
    // руками целиком.
    render(<SummaryTaskEditor tasks={[]} onSave={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /Добавить задачу/ }));

    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('до правки «Сохранить» выключена, после — доступна', async () => {
    // isDirty считается сравнением с загруженным набором — как у панели
    // версии.
    render(<SummaryTaskEditor tasks={[TASK_A]} onSave={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();

    await userEvent.type(screen.getByRole('textbox'), ' ещё');

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled();
  });

  it('подпись «это предложения модели» стоит постоянно', () => {
    // Не всплывающая и не скрываемая: инвариант ТЗ 5.3 требует, чтобы
    // человек видел происхождение списка до нажатия релиза.
    render(<SummaryTaskEditor tasks={[TASK_A]} onSave={vi.fn()} />);

    expect(screen.getByText(/предложения модели/)).toBeInTheDocument();
  });

  it('строка от модели помечена', () => {
    // Инвариант ТЗ 5.3: человек обязан видеть, что пришло от машины.
    render(
      <SummaryTaskEditor tasks={[{ ...TASK_A, origin: SummaryTaskOrigin.Model }]} onSave={vi.fn()} />,
    );

    expect(screen.getByText(/предложено моделью/)).toBeInTheDocument();
  });

  it('строка, набранная человеком, метки не несёт', () => {
    render(<SummaryTaskEditor tasks={[TASK_A]} onSave={vi.fn()} />);

    expect(screen.queryByText(/предложено моделью/)).not.toBeInTheDocument();
  });

  it('добавленная руками строка метки модели не получает', async () => {
    render(
      <SummaryTaskEditor tasks={[{ ...TASK_A, origin: SummaryTaskOrigin.Model }]} onSave={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Добавить задачу/ }));

    expect(screen.getAllByText(/предложено моделью/)).toHaveLength(1);
  });

  it('после сформированного релиза редактор только для чтения', () => {
    // Чекпоинты живут в роадмапе и правятся там.
    render(<SummaryTaskEditor tasks={[TASK_A]} onSave={vi.fn()} isReleased />);

    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Удалить' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Добавить задачу/ })).not.toBeInTheDocument();
  });

  it('пустая формулировка сохраняться не даёт', async () => {
    render(<SummaryTaskEditor tasks={[TASK_A]} onSave={vi.fn()} />);
    await userEvent.clear(screen.getByRole('textbox'));

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });

  it('сохранение отдаёт формулировки в порядке списка, с id существующих', async () => {
    // Позиции не отправляются: порядок задаёт порядок массива.
    const onSave = vi.fn();
    render(<SummaryTaskEditor tasks={[TASK_A, TASK_B]} onSave={onSave} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Ниже' })[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSave).toHaveBeenCalledWith({
      tasks: [
        { id: TASK_B.id, title: 'два' },
        { id: TASK_A.id, title: 'раз' },
      ],
    });
  });

  it('формулировки выводятся текстом, а не разметкой', () => {
    // Вывод модели недоверен: никакого Markdown и
    // dangerouslySetInnerHTML.
    render(
      <SummaryTaskEditor
        tasks={[{ ...TASK_A, title: '<b>жирно</b>', origin: SummaryTaskOrigin.Model }]}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue('<b>жирно</b>')).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
  });

  it('о несохранённых правках сказано рядом с кнопкой', async () => {
    render(<SummaryTaskEditor tasks={[TASK_A]} onSave={vi.fn()} />);

    await userEvent.type(screen.getByRole('textbox'), ' ещё');

    expect(screen.getByText(/не сохранены/)).toBeInTheDocument();
  });
});
