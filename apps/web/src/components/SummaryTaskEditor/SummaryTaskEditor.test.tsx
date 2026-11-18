import {
  MAX_SUMMARY_TASKS,
  MAX_SUMMARY_TASK_TITLE,
  PlatformKind,
  SummaryTaskOrigin,
  type Platform,
  type SummaryTask,
} from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SummaryTaskEditor } from './SummaryTaskEditor';

const TASK_A: SummaryTask = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'раз',
  position: 1,
  origin: SummaryTaskOrigin.Human,
  url: null,
  platformIds: [],
};

const TASK_B: SummaryTask = {
  id: '22222222-2222-2222-2222-222222222222',
  title: 'два',
  position: 2,
  origin: SummaryTaskOrigin.Human,
  url: null,
  platformIds: [],
};

const API: Platform = {
  id: '33333333-3333-3333-3333-333333333333',
  kind: PlatformKind.Server,
  name: 'API',
  position: 1,
};

/** Формулировки в том порядке, в котором они показаны. */
function titles(): string[] {
  return screen.getAllByRole('textbox').map((field) => (field as HTMLInputElement).value);
}

describe('редактор черновика задач', () => {
  it('«Ниже» меняет порядок двух строк', async () => {
    render(<SummaryTaskEditor tasks={[TASK_A, TASK_B]} platforms={[]}
        onSave={vi.fn()} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Ниже' })[0]!);

    expect(titles()).toEqual(['два', 'раз']);
  });

  it('«Выше» меняет порядок обратно', async () => {
    render(<SummaryTaskEditor tasks={[TASK_A, TASK_B]} platforms={[]}
        onSave={vi.fn()} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Выше' })[1]!);

    expect(titles()).toEqual(['два', 'раз']);
  });

  it('перетаскивания нет: порядок меняется кнопками', () => {
    // Библиотеки DnD в проекте нет, а кнопки доступны с клавиатуры и
    // читалкой, в отличие от перетаскивания.
    render(<SummaryTaskEditor tasks={[TASK_A, TASK_B]} platforms={[]}
        onSave={vi.fn()} />);

    expect(screen.getAllByRole('button', { name: 'Выше' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Ниже' })).toHaveLength(2);
  });

  it('«Удалить» убирает строку', async () => {
    render(<SummaryTaskEditor tasks={[TASK_A, TASK_B]} platforms={[]}
        onSave={vi.fn()} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Удалить' })[0]!);

    expect(titles()).toEqual(['два']);
  });

  it('«Добавить задачу» добавляет пустую строку и ставит на неё фокус', async () => {
    // Работает и при выключенном предложителе: список можно набрать
    // руками целиком.
    render(<SummaryTaskEditor tasks={[]} platforms={[]}
        onSave={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /Добавить задачу/ }));

    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('до правки «Сохранить» выключена, после — доступна', async () => {
    // isDirty считается сравнением с загруженным набором — как у панели
    // версии.
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[]}
        onSave={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();

    await userEvent.type(screen.getByRole('textbox'), ' ещё');

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled();
  });

  it('подпись «это предложения модели» стоит постоянно', () => {
    // Не всплывающая и не скрываемая: инвариант ТЗ 5.3 требует, чтобы
    // человек видел происхождение списка до нажатия релиза.
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[]}
        onSave={vi.fn()} />);

    expect(screen.getByText(/предложения модели/)).toBeInTheDocument();
  });

  it('строка от модели помечена', () => {
    // Инвариант ТЗ 5.3: человек обязан видеть, что пришло от машины.
    render(
      <SummaryTaskEditor tasks={[{ ...TASK_A, origin: SummaryTaskOrigin.Model }]} platforms={[]}
        onSave={vi.fn()} />,
    );

    expect(screen.getByText(/предложено моделью/)).toBeInTheDocument();
  });

  it('строка, набранная человеком, метки не несёт', () => {
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[]}
        onSave={vi.fn()} />);

    expect(screen.queryByText(/предложено моделью/)).not.toBeInTheDocument();
  });

  it('добавленная руками строка метки модели не получает', async () => {
    render(
      <SummaryTaskEditor tasks={[{ ...TASK_A, origin: SummaryTaskOrigin.Model }]} platforms={[]}
        onSave={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Добавить задачу/ }));

    expect(screen.getAllByText(/предложено моделью/)).toHaveLength(1);
  });

  it('после сформированного релиза редактор только для чтения', () => {
    // Чекпоинты живут в роадмапе и правятся там.
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[]}
        onSave={vi.fn()} isReleased />);

    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Удалить' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Добавить задачу/ })).not.toBeInTheDocument();
  });

  it('пустая формулировка сохраняться не даёт', async () => {
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[]}
        onSave={vi.fn()} />);
    await userEvent.clear(screen.getByRole('textbox'));

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });

  it('сохранение отдаёт формулировки в порядке списка, с id существующих', async () => {
    // Позиции не отправляются: порядок задаёт порядок массива. Ссылка
    // уезжает всегда — её редактор видит и правит при любых правах;
    // набора тегов здесь нет, потому что платформ не видно.
    const onSave = vi.fn();
    render(<SummaryTaskEditor tasks={[TASK_A, TASK_B]} platforms={[]}
        onSave={onSave} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Ниже' })[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSave).toHaveBeenCalledWith({
      tasks: [
        { id: TASK_B.id, title: 'два', url: null },
        { id: TASK_A.id, title: 'раз', url: null },
      ],
    });
  });

  it('формулировки выводятся текстом, а не разметкой', () => {
    // Вывод модели недоверен: никакого Markdown и
    // dangerouslySetInnerHTML.
    render(
      <SummaryTaskEditor
        tasks={[{ ...TASK_A, title: '<b>жирно</b>', origin: SummaryTaskOrigin.Model }]}
        platforms={[]}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue('<b>жирно</b>')).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
  });

  it('формулировка длиннее предела не набирается', async () => {
    // Предел держит форма: 301-й знак получил бы `400` от zod с кодом,
    // которого карта отказов не знает, и человек увидел бы общее
    // сообщение сервера вместо объяснения.
    const long = 'я'.repeat(MAX_SUMMARY_TASK_TITLE);
    render(<SummaryTaskEditor tasks={[{ ...TASK_A, title: long }]} platforms={[]}
        onSave={vi.fn()} />);

    await userEvent.type(screen.getByRole('textbox'), 'ещё');

    expect(screen.getByRole('textbox')).toHaveValue(long);
  });

  it('строк больше предела не добавляется, и предел назван', async () => {
    const many = Array.from({ length: MAX_SUMMARY_TASKS }, (_, index) => ({
      ...TASK_A,
      id: `11111111-1111-1111-1111-${String(index).padStart(12, '0')}`,
      title: `задача ${index + 1}`,
      position: index + 1,
    }));
    render(<SummaryTaskEditor tasks={many} platforms={[]}
        onSave={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /Добавить задачу/ }));

    expect(screen.getAllByRole('textbox')).toHaveLength(MAX_SUMMARY_TASKS);
    expect(screen.getByText(new RegExp(String(MAX_SUMMARY_TASKS)))).toBeInTheDocument();
  });

  it('о несохранённых правках сказано рядом с кнопкой', async () => {
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[]} onSave={vi.fn()} />);

    await userEvent.type(screen.getByRole('textbox'), ' ещё');

    expect(screen.getByText(/не сохранены/)).toBeInTheDocument();
  });
});

describe('ссылка и теги в строке', () => {
  it('поля скрыты, пока строку не раскрыли', () => {
    // Два поля на каждой из двадцати строк сделали бы список нечитаемым
    // (дизайн, 7.1).
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[API]} onSave={vi.fn()} />);

    expect(screen.queryByLabelText('Ссылка на задачу')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'API' })).not.toBeInTheDocument();
  });

  it('раскрывает строку на месте', async () => {
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[API]} onSave={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Подробнее' }));

    expect(screen.getByLabelText('Ссылка на задачу')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'API' })).toBeInTheDocument();
  });

  it('раскрыватель называет своё состояние читалке', () => {
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[API]} onSave={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Подробнее' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('раскрывает все строки разом', async () => {
    // Это и есть «один проход по списку» буквально.
    render(<SummaryTaskEditor tasks={[TASK_A, TASK_B]} platforms={[API]} onSave={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Показать подробности у всех' }));

    expect(screen.getAllByLabelText('Ссылка на задачу')).toHaveLength(2);
  });

  it('сворачивает все строки тем же переключателем', async () => {
    render(<SummaryTaskEditor tasks={[TASK_A, TASK_B]} platforms={[API]} onSave={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Показать подробности у всех' }));
    await userEvent.click(screen.getByRole('button', { name: 'Скрыть подробности у всех' }));

    expect(screen.queryByLabelText('Ссылка на задачу')).not.toBeInTheDocument();
  });

  it('свёрнутая строка не скрывает заполненного', () => {
    // Поле, которого не видно и о котором ничего не сказано, человек
    // считает пустым — и поставит второй раз или не заметит чужого.
    render(
      <SummaryTaskEditor
        tasks={[{ ...TASK_A, url: 'https://tracker.example/1', platformIds: [API.id] }]}
        platforms={[API]}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText('API')).toBeInTheDocument();
    expect(screen.getByText(/ссылка/i)).toBeInTheDocument();
  });

  it('без платформ чипов нет вовсе, а поле ссылки есть', async () => {
    // Пустой список означает «показывать нечего» и накрывает два случая
    // намеренно неотличимо (дизайн, 3.2). Ссылку при этом вписывает и
    // субъект без выдачи на роадмап: она уедет туда же тем же релизом.
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[]} onSave={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Подробнее' }));

    expect(screen.queryByRole('group', { name: 'Платформы' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Ссылка на задачу')).toBeInTheDocument();
  });

  it('набор тегов не отправляется, когда платформ не видно', async () => {
    // Иначе правка формулировки стёрла бы невидимые теги (дизайн, 3.3).
    const onSave = vi.fn();
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[]} onSave={onSave} />);

    await userEvent.type(screen.getByLabelText('Формулировка задачи'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSave).toHaveBeenCalledWith({
      tasks: [{ id: TASK_A.id, title: `${TASK_A.title}!`, url: null }],
    });
  });

  it('набор тегов отправляется, когда платформы видны', async () => {
    const onSave = vi.fn();
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[API]} onSave={onSave} />);

    await userEvent.click(screen.getByRole('button', { name: 'Подробнее' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'API' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSave).toHaveBeenCalledWith({
      tasks: [{ id: TASK_A.id, title: TASK_A.title, url: null, platformIds: [API.id] }],
    });
  });

  it('правка ссылки включает кнопку сохранения', async () => {
    // Иначе правка терялась бы молча — её же стережёт предупреждение об
    // уходе со страницы.
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[API]} onSave={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Подробнее' }));
    await userEvent.type(screen.getByLabelText('Ссылка на задачу'), 'https://tracker.example/1');

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled();
  });

  it('снятие тега включает кнопку сохранения', async () => {
    render(
      <SummaryTaskEditor
        tasks={[{ ...TASK_A, platformIds: [API.id] }]}
        platforms={[API]}
        onSave={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Подробнее' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'API' }));

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled();
  });

  it('негодный адрес не даёт сохранить и называет строку', async () => {
    // Предел и формат держит форма: `400` от zod пришёл бы без кода
    // отказа и без указания строки (дизайн, 7.3).
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[API]} onSave={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Подробнее' }));
    await userEvent.type(screen.getByLabelText('Ссылка на задачу'), 'CAIRN-1');

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
    expect(screen.getByText(/адрес/i)).toBeInTheDocument();
  });

  it('пустая ссылка законна и уезжает как `null`', async () => {
    const onSave = vi.fn();
    render(
      <SummaryTaskEditor
        tasks={[{ ...TASK_A, url: 'https://tracker.example/1' }]}
        platforms={[API]}
        onSave={onSave}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Подробнее' }));
    await userEvent.clear(screen.getByLabelText('Ссылка на задачу'));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSave).toHaveBeenCalledWith({
      tasks: [{ id: TASK_A.id, title: TASK_A.title, url: null, platformIds: [] }],
    });
  });

  it('после релиза поля только читаются', async () => {
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[API]} onSave={vi.fn()} isReleased />);

    await userEvent.click(screen.getByRole('button', { name: 'Подробнее' }));

    expect(screen.getByLabelText('Ссылка на задачу')).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'API' })).toBeDisabled();
  });

  it('тег, которого нет в списке платформ, не рисуется и не отправляется', async () => {
    // Единственный способ его получить — запрос в обход интерфейса;
    // следующее сохранение его уносит (дизайн, 5.5).
    const onSave = vi.fn();
    render(
      <SummaryTaskEditor
        tasks={[{ ...TASK_A, platformIds: ['44444444-4444-4444-4444-444444444444'] }]}
        platforms={[API]}
        onSave={onSave}
      />,
    );

    await userEvent.type(screen.getByLabelText('Формулировка задачи'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSave).toHaveBeenCalledWith({
      tasks: [{ id: TASK_A.id, title: `${TASK_A.title}!`, url: null, platformIds: [] }],
    });
  });
});
