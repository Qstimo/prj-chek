import {
  MAX_SUMMARY_TASKS,
  MAX_SUMMARY_TASK_TITLE,
  PlatformKind,
  SummaryTaskOrigin,
  SummaryTaskState,
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
  state: SummaryTaskState.Active,
  releasedVersionId: null,
  releasedVersionLabel: null,
  url: null,
  platformIds: [],
};

const TASK_B: SummaryTask = {
  id: '22222222-2222-2222-2222-222222222222',
  title: 'два',
  position: 2,
  origin: SummaryTaskOrigin.Human,
  state: SummaryTaskState.Active,
  releasedVersionId: null,
  releasedVersionLabel: null,
  url: null,
  platformIds: [],
};

const API: Platform = {
  id: '33333333-3333-3333-3333-333333333333',
  kind: PlatformKind.Server,
  name: 'API',
  position: 1,
};

/** Подпись поля формулировки: в карточке рядом с ним живёт поле ссылки. */
const TITLE = 'Формулировка задачи';

/** Поля формулировок в том порядке, в котором они показаны. */
function titleFields(): HTMLTextAreaElement[] {
  return screen.getAllByLabelText(TITLE) as HTMLTextAreaElement[];
}

/** Формулировки в том порядке, в котором они показаны. */
function titles(): string[] {
  return titleFields().map((field) => field.value);
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

    expect(titleFields()).toHaveLength(1);
    expect(screen.getByLabelText(TITLE)).toHaveFocus();
  });

  it('до правки «Сохранить» выключена, после — доступна', async () => {
    // isDirty считается сравнением с загруженным набором — как у панели
    // версии.
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[]}
        onSave={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();

    await userEvent.type(screen.getByLabelText(TITLE), ' ещё');

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

  it('пустая формулировка сохраняться не даёт', async () => {
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[]}
        onSave={vi.fn()} />);
    await userEvent.clear(screen.getByLabelText(TITLE));

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

    await userEvent.type(screen.getByLabelText(TITLE), 'ещё');

    expect(screen.getByLabelText(TITLE)).toHaveValue(long);
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

    expect(titleFields()).toHaveLength(MAX_SUMMARY_TASKS);
    // Числом из контракта, но фразой предела: формулировка «задача 200»
    // в карточке — тоже текст с этим числом.
    expect(
      screen.getByText(new RegExp(`не больше ${MAX_SUMMARY_TASKS} задач`)),
    ).toBeInTheDocument();
  });

  it('о несохранённых правках сказано рядом с кнопкой', async () => {
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[]} onSave={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(TITLE), ' ещё');

    expect(screen.getByText(/не сохранены/)).toBeInTheDocument();
  });
});

describe('отметки и полоса действий', () => {
  /** Набор обработчиков действий над выбором со свежими шпионами. */
  function actions() {
    return { onRelease: vi.fn(), onArchive: vi.fn(), onDelete: vi.fn() };
  }

  /** Отметки карточек в том порядке, в котором они показаны. */
  function marks(): HTMLInputElement[] {
    return screen.getAllByRole('checkbox', { name: 'Отметить задачу' }) as HTMLInputElement[];
  }

  it('без действий над выбором отметок нет вовсе', () => {
    // Отметка существует ради следующего действия: без действий она
    // предлагала бы выбрать и ничего с выбранным не сделать.
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[]} onSave={vi.fn()} />);

    expect(screen.queryByRole('checkbox', { name: 'Отметить задачу' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отметить все' })).not.toBeInTheDocument();
  });

  it('«Отметить все» отмечает каждую карточку', async () => {
    render(
      <SummaryTaskEditor tasks={[TASK_A, TASK_B]} platforms={[]} onSave={vi.fn()} actions={actions()} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Отметить все' }));

    expect(marks().every((mark) => mark.checked)).toBe(true);
  });

  it('полоса называет число отмеченных', async () => {
    render(
      <SummaryTaskEditor tasks={[TASK_A, TASK_B]} platforms={[]} onSave={vi.fn()} actions={actions()} />,
    );

    await userEvent.click(marks()[0]!);

    expect(screen.getByText('Отмечено: 1')).toBeInTheDocument();
  });

  it('пустой выбор выключает три действия над выбором', () => {
    // «Сохранить» к выбору не относится и своей причиной выключена
    // отдельно: она про черновик целиком.
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[]} onSave={vi.fn()} actions={actions()} />);

    expect(screen.getByRole('button', { name: 'Сформировать релиз (0)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'В архив (0)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Удалить (0)' })).toBeDisabled();
  });

  it('отметка включает три действия и называет число в подписях', async () => {
    render(
      <SummaryTaskEditor tasks={[TASK_A, TASK_B]} platforms={[]} onSave={vi.fn()} actions={actions()} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Отметить все' }));

    expect(screen.getByRole('button', { name: 'Сформировать релиз (2)' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'В архив (2)' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Удалить (2)' })).toBeEnabled();
  });

  it('«В архив» отдаёт отмеченные и подтверждения не спрашивает', async () => {
    // Архив обратим одной кнопкой, и диалог на обратимое действие учит
    // нажимать «да» не читая (дизайн, 4.3).
    const handlers = actions();
    render(
      <SummaryTaskEditor tasks={[TASK_A, TASK_B]} platforms={[]} onSave={vi.fn()} actions={handlers} />,
    );

    await userEvent.click(marks()[1]!);
    await userEvent.click(screen.getByRole('button', { name: 'В архив (1)' }));

    expect(handlers.onArchive).toHaveBeenCalledWith([TASK_B.id]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('«Сформировать релиз» отдаёт отмеченные', async () => {
    const handlers = actions();
    render(
      <SummaryTaskEditor tasks={[TASK_A, TASK_B]} platforms={[]} onSave={vi.fn()} actions={handlers} />,
    );

    await userEvent.click(marks()[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Сформировать релиз (1)' }));

    expect(handlers.onRelease).toHaveBeenCalledWith([TASK_A.id]);
  });

  it('удаление спрашивает подтверждение и называет число', async () => {
    // Потеря содержимого: число названо до нажатия, а не после.
    const handlers = actions();
    render(
      <SummaryTaskEditor tasks={[TASK_A, TASK_B]} platforms={[]} onSave={vi.fn()} actions={handlers} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Отметить все' }));
    await userEvent.click(screen.getByRole('button', { name: 'Удалить (2)' }));

    expect(handlers.onDelete).not.toHaveBeenCalled();
    expect(screen.getByText(/2 задачи/)).toBeInTheDocument();
  });

  it('подтверждённое удаление отдаёт отмеченные', async () => {
    const handlers = actions();
    render(
      <SummaryTaskEditor tasks={[TASK_A, TASK_B]} platforms={[]} onSave={vi.fn()} actions={handlers} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Отметить все' }));
    await userEvent.click(screen.getByRole('button', { name: 'Удалить (2)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Да, удалить' }));

    expect(handlers.onDelete).toHaveBeenCalledWith([TASK_A.id, TASK_B.id]);
  });

  it('отменённое удаление не отдаёт ничего', async () => {
    const handlers = actions();
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[]} onSave={vi.fn()} actions={handlers} />);

    await userEvent.click(screen.getByRole('button', { name: 'Отметить все' }));
    await userEvent.click(screen.getByRole('button', { name: 'Удалить (1)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(handlers.onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('несохранённые правки выключают все три действия и названы', async () => {
    // Ручки работают с тем, что в базе: унести в архив строку,
    // формулировку которой человек только что правил в памяти, значило бы
    // потерять правку молча (дизайн, 4.3).
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[]} onSave={vi.fn()} actions={actions()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Отметить все' }));
    await userEvent.type(screen.getByLabelText(TITLE), ' ещё');

    expect(screen.getByRole('button', { name: 'Сформировать релиз (1)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'В архив (1)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Удалить (1)' })).toBeDisabled();
    expect(screen.getByText(/Сначала сохраните правки/)).toBeInTheDocument();
  });

  it('без права на роадмап выключен только релиз', async () => {
    // Архив и удаление — та же «Хроника ≥ запись», что правка черновика:
    // отсутствие выдачи на роадмап их не касается (дизайн, 3.3).
    render(
      <SummaryTaskEditor
        tasks={[TASK_A]}
        platforms={[]}
        onSave={vi.fn()}
        actions={{ ...actions(), releaseBlockedNote: 'Нет права на «Роадмап» этого проекта.' }}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Отметить все' }));

    expect(screen.getByRole('button', { name: 'Сформировать релиз (1)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'В архив (1)' })).toBeEnabled();
    expect(screen.getByText(/Нет права на «Роадмап»/)).toBeInTheDocument();
  });

  it('отметки сбрасываются, когда приходит другой набор', async () => {
    // Показывать отметку поверх свежего ответа значило бы предлагать
    // действие над строкой, которой уже нет (дизайн, 4.3).
    const { rerender } = render(
      <SummaryTaskEditor tasks={[TASK_A, TASK_B]} platforms={[]} onSave={vi.fn()} actions={actions()} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Отметить все' }));
    rerender(
      <SummaryTaskEditor tasks={[TASK_A]} platforms={[]} onSave={vi.fn()} actions={actions()} />,
    );

    expect(marks()[0]!.checked).toBe(false);
    expect(screen.getByText('Отмечено: 0')).toBeInTheDocument();
  });

  it('несохранённая новая строка не отмечается', async () => {
    // У неё нет `id`: ручкам действий её назвать нечем, пока она не
    // сохранена.
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[]} onSave={vi.fn()} actions={actions()} />);

    await userEvent.click(screen.getByRole('button', { name: /Добавить задачу/ }));

    expect(marks()[1]).toBeDisabled();
  });
});

describe('ссылка и теги в карточке', () => {
  it('поля видны всегда, без раскрытия', () => {
    // Карточка, а не строка с раскрывателем: «сразу всё видно» — это и
    // есть смысл рабочего экрана (дизайн, 4.3).
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[API]} onSave={vi.fn()} />);

    expect(screen.getByLabelText('Ссылка на задачу')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'API' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Подробнее' })).not.toBeInTheDocument();
  });

  it('раскрывателя и переключателя «у всех» больше нет', () => {
    // Они существовали только затем, чтобы достать поля из-под стрелки.
    render(<SummaryTaskEditor tasks={[TASK_A, TASK_B]} platforms={[API]} onSave={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /подробност/i })).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Ссылка на задачу')).toHaveLength(2);
  });

  it('формулировка набирается в несколько строк', () => {
    // Задача созвона в одну строку не укладывается, а поле, которое её
    // обрезает, заставляет править текст вслепую (дизайн, 4.3).
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[]} onSave={vi.fn()} />);

    expect(screen.getByLabelText(TITLE).tagName).toBe('TEXTAREA');
  });

  it('заполненные поля видны со своими значениями', () => {
    // Поле, которого не видно и о котором ничего не сказано, человек
    // считает пустым — и поставит второй раз или не заметит чужого.
    render(
      <SummaryTaskEditor
        tasks={[{ ...TASK_A, url: 'https://tracker.example/1', platformIds: [API.id] }]}
        platforms={[API]}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Ссылка на задачу')).toHaveValue('https://tracker.example/1');
    expect(screen.getByRole('checkbox', { name: 'API' })).toBeChecked();
  });

  it('без платформ чипов нет вовсе, а поле ссылки есть', () => {
    // Пустой список означает «показывать нечего» и накрывает два случая
    // намеренно неотличимо (дизайн, 3.2). Ссылку при этом вписывает и
    // субъект без выдачи на роадмап: она уедет туда же тем же релизом.
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[]} onSave={vi.fn()} />);

    expect(screen.queryByRole('group', { name: 'Платформы' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Ссылка на задачу')).toBeInTheDocument();
  });

  it('набор тегов не отправляется, когда платформ не видно', async () => {
    // Иначе правка формулировки стёрла бы невидимые теги (дизайн, 3.3).
    const onSave = vi.fn();
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[]} onSave={onSave} />);

    await userEvent.type(screen.getByLabelText(TITLE), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSave).toHaveBeenCalledWith({
      tasks: [{ id: TASK_A.id, title: `${TASK_A.title}!`, url: null }],
    });
  });

  it('набор тегов отправляется, когда платформы видны', async () => {
    const onSave = vi.fn();
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[API]} onSave={onSave} />);

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

    await userEvent.click(screen.getByRole('checkbox', { name: 'API' }));

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled();
  });

  it('негодный адрес не даёт сохранить и называет строку', async () => {
    // Предел и формат держит форма: `400` от zod пришёл бы без кода
    // отказа и без указания строки (дизайн, 7.3).
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[API]} onSave={vi.fn()} />);

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

    await userEvent.clear(screen.getByLabelText('Ссылка на задачу'));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSave).toHaveBeenCalledWith({
      tasks: [{ id: TASK_A.id, title: TASK_A.title, url: null, platformIds: [] }],
    });
  });

  it('редактор правится и после сформированного релиза', () => {
    // Релиз больше не замораживает редактор: замораживаются уехавшие
    // задачи, и своим состоянием, а не флажком саммари (дизайн, 2.5).
    // Уехавшие сюда не попадают вовсе — у них свой список только для
    // чтения, поэтому признака «релиз сформирован» у редактора нет.
    render(<SummaryTaskEditor tasks={[TASK_A]} platforms={[API]} onSave={vi.fn()} />);

    expect(screen.getByLabelText('Ссылка на задачу')).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'API' })).toBeEnabled();
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

    await userEvent.type(screen.getByLabelText(TITLE), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSave).toHaveBeenCalledWith({
      tasks: [{ id: TASK_A.id, title: `${TASK_A.title}!`, url: null, platformIds: [] }],
    });
  });
});
