import { RoadmapVersionState } from '@cairn/shared';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_COLUMNS, LIST_WINDOW, STEP, STRIP_MAX_VERSIONS } from './constants';
import { RoadmapTimeline } from './RoadmapTimeline';
import { kneePath, sectorPath } from './sector';

// Короткий роадмап для проверок отметок и выбора версии.
const versions = [
  {
    id: '1',
    label: 'v1.0',
    state: RoadmapVersionState.Released,
    plannedDate: '2026-06-01',
    releasedDate: '2026-06-15',
    progress: { done: 1, total: 3 },
  },
  {
    id: '2',
    label: 'v2.0',
    state: RoadmapVersionState.InProgress,
    plannedDate: '2026-12-01',
    releasedDate: null,
    progress: { done: 1, total: 2 },
  },
  {
    id: '3',
    label: 'v3.0',
    state: RoadmapVersionState.Planned,
    plannedDate: null,
    releasedDate: null,
    progress: { done: 0, total: 0 },
  },
];

/** Набор из нужного числа версий: подписи «v1», «v2», … по порядку. */
function manyVersions(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index + 1),
    label: `v${index + 1}`,
    state: RoadmapVersionState.Planned,
    plannedDate: '2026-12-01',
    releasedDate: null,
    progress: { done: 0, total: 0 },
  }));
}

function ControlledTimeline({ count }: { count: number }) {
  const [last, setLast] = useState<number | null>(LIST_WINDOW);
  return <RoadmapTimeline versions={manyVersions(count)} currentIndex={count - 1} form="list" last={last} onChangeLast={setLast} />;
}

/**
 * Ширина места под полосу.
 *
 * В jsdom размеров нет вовсе: `clientWidth` всегда ноль, а серпантин
 * заполняет строку по измеренной ширине. Подменяется геттер прототипа —
 * иначе измерять нечего, и проверить дефект 23 было бы нечем.
 */
function stubWidth(px: number) {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => px,
  });
}

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
  vi.unstubAllGlobals();
});

describe('sectorPath', () => {
  it('нулевая доля не рисует сектора', () => {
    expect(sectorPath(0, 0, 10, 0)).toBeNull();
  });

  it('полная доля отдаёт признак полного круга', () => {
    expect(sectorPath(0, 0, 10, 1)).toBe('full');
  });

  it('половина — дуга до шести часов', () => {
    const path = sectorPath(0, 0, 10, 0.5);

    // Пирог от 12 часов по часовой: половина заканчивается внизу (0, 10).
    expect(path).toContain('M 0 0');
    expect(path).toContain('L 0 -10');
    expect(path).toMatch(/0\s+10\s*Z$/);
  });
});

describe('kneePath', () => {
  it('правое колено уходит вправо, вниз и возвращается влево', () => {
    const path = kneePath({ side: 'right', width: 24, markY: 28, bottomY: 172, radius: 8 });

    // Концы колена — на уровне центров отметок обеих строк, и начинается
    // оно от края места версии, где у неё кончился полуотрезок оси.
    expect(path.startsWith('M 0 28')).toBe(true);
    expect(path).toContain('V 164');
    expect(path.endsWith('H 0')).toBe(true);
  });

  it('левое колено — зеркальное', () => {
    const path = kneePath({ side: 'left', width: 24, markY: 28, bottomY: 172, radius: 8 });

    expect(path.startsWith('M 24 28')).toBe(true);
    expect(path.endsWith('H 24')).toBe(true);
  });
});

describe('RoadmapTimeline', () => {
  it('подписывает версии обозначениями', () => {
    render(<RoadmapTimeline versions={versions} currentIndex={1} />);

    expect(screen.getByText('v1.0')).toBeInTheDocument();
    expect(screen.getByText('v3.0')).toBeInTheDocument();
  });

  it('длинные названия обрезаются, а полное доступно подсказкой', () => {
    // Схема разрешает обозначение до 100 знаков. Прежний перенос по словам
    // разворачивал такое в два десятка строк и растягивал всю ленту по
    // высоте самой длинной подписи.
    const long = [
      {
        id: '1',
        label: 'v1.1 — оплата картой, СБП и рассрочка для корпоративных клиентов',
        state: RoadmapVersionState.Released,
        plannedDate: null,
        releasedDate: null,
        progress: { done: 1, total: 1 },
      },
    ];
    const { container } = render(<RoadmapTimeline versions={long} currentIndex={0} />);
    const label = screen.getByText(long[0]!.label);

    expect(label).toHaveClass('truncate');
    expect(label).toHaveAttribute('title', long[0]!.label);
    // В SVG текст не переносится и налезает на соседей; подписи — в HTML.
    expect(container.querySelector('svg text')).toBeNull();
  });

  it('выпущенная версия — полный круг независимо от чекпоинтов', () => {
    const { container } = render(<RoadmapTimeline versions={versions} currentIndex={1} />);

    const released = container.querySelector('[data-version="v1.0"] [data-fill="full"]');
    expect(released).not.toBeNull();
  });

  it('текущая версия помечена и для глаза, и для скринридера', () => {
    const { container } = render(
      <RoadmapTimeline versions={versions} currentIndex={1} onSelect={vi.fn()} />,
    );

    expect(container.querySelector('[data-version="v2.0"][data-current="true"]')).not.toBeNull();
    expect(container.querySelector('[data-version="v1.0"][data-current="true"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Версия v2.0' })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByRole('button', { name: 'Версия v1.0' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('метка текущей версии остаётся на ней при съехавшем окне', () => {
    // Дефект 20: окно умеет съезжать к текущей версии, а позиция считалась
    // как «отрезано с конца». При сотне версий и текущей третьей «вы
    // здесь» не доставалось никому — ради этой метки на полосу и смотрят.
    const count = 103;
    const { container } = render(
      <RoadmapTimeline versions={manyVersions(count)} currentIndex={2} form="list" />,
    );

    expect(container.querySelector('[data-version="v3"][data-current="true"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-current="true"]')).toHaveLength(1);
  });

  it('место в наборе стоит на элементе списка и считается от начала окна', () => {
    // Дефект 21: `aria-posinset` жил на кнопке, где он не читается ролью
    // listitem, и считался от конца набора.
    const count = 103;
    const { container } = render(
      <RoadmapTimeline
        versions={manyVersions(count)}
        currentIndex={2}
        form="list"
        onSelect={vi.fn()}
      />,
    );
    const slot = container.querySelector('[data-version="v3"]')!;

    expect(slot.tagName).toBe('LI');
    expect(slot).toHaveAttribute('aria-posinset', '3');
    expect(slot).toHaveAttribute('aria-setsize', String(count));
    expect(screen.getByRole('button', { name: 'Версия v3' })).not.toHaveAttribute('aria-posinset');
  });

  it('размер отметки не зависит от числа версий', () => {
    // Прежде SVG тянулся на ширину колонки (`w-full`), а разметка
    // масштабировалась вместе с ним: на полусотне версий круг выходил
    // в 4 px. Шаг задан атрибутами и постоянен.
    const one = render(<RoadmapTimeline versions={[versions[0]!]} currentIndex={0} />);
    const single = one.container.querySelector('svg');

    expect(single).toHaveAttribute('width', String(STEP));
    one.unmount();

    const many = render(
      <RoadmapTimeline versions={manyVersions(STRIP_MAX_VERSIONS)} currentIndex={0} />,
    );

    expect(many.container.querySelector('svg')).toHaveAttribute('width', String(STEP));
  });

  it('шаг задан один раз: место версии той же ширины, что отметка', () => {
    // Дефект 25: STEP в SVG против `w-24` в классах места — они совпадали
    // только при корневом шрифте 16 px.
    const { container } = render(<RoadmapTimeline versions={versions} currentIndex={0} />);

    expect(container.querySelector('[data-item]')).toHaveStyle({ width: `${STEP}px` });
  });

  it('счёт чекпоинтов стоит рядом с отметкой', () => {
    // Ради этого всё и затевалось: зажатый сектор говорит о состоянии,
    // а точное число — словами.
    render(<RoadmapTimeline versions={versions} currentIndex={1} />);

    expect(screen.getByText('1 из 2')).toBeInTheDocument();
    expect(screen.getByText('чекпоинтов нет')).toBeInTheDocument();
  });

  it('серпантин выбран по умолчанию при любом числе версий', () => {
    const strip = render(
      <RoadmapTimeline versions={manyVersions(STRIP_MAX_VERSIONS)} currentIndex={0} />,
    );

    expect(strip.container.querySelector('[data-form="serpentine"]')).not.toBeNull();
    expect(strip.container.querySelectorAll('[data-item]')).toHaveLength(STRIP_MAX_VERSIONS);
    strip.unmount();

    const serpentine = render(
      <RoadmapTimeline versions={manyVersions(STRIP_MAX_VERSIONS + 1)} currentIndex={0} />,
    );

    expect(serpentine.container.querySelector('[data-form="serpentine"]')).not.toBeNull();
  });

  it('укладку задаёт проп, а не только количество', () => {
    const list = render(<RoadmapTimeline versions={versions} currentIndex={0} form="list" />);

    expect(list.container.querySelector('[data-form="list"]')).not.toBeNull();
    expect(list.container.querySelectorAll('svg')).toHaveLength(0);
    expect(list.container.querySelectorAll('[data-fill]').length).toBeGreaterThan(0);
    list.unmount();

    const strip = render(
      <RoadmapTimeline versions={manyVersions(40)} currentIndex={0} form="strip" last={null} />,
    );

    expect(strip.container.querySelector('[data-form="strip"]')).not.toBeNull();
    expect(strip.container.querySelectorAll('[data-knee]')).toHaveLength(0);
  });

  it('серпантин складывает версии в строки, а между строками кладёт колено', () => {
    const { container } = render(
      <RoadmapTimeline
        versions={manyVersions(13)}
        currentIndex={0}
        form="serpentine"
        last={null}
      />,
    );
    const knees = container.querySelectorAll('[data-knee]');

    // Умолчание — DEFAULT_COLUMNS столбцов: ширину в jsdom не измерить.
    expect(DEFAULT_COLUMNS).toBe(6);
    expect(container.querySelectorAll('[data-item]')).toHaveLength(13);
    expect(knees).toHaveLength(2);
    expect(knees[0]).toHaveAttribute('data-knee', 'right');
    expect(knees[1]).toHaveAttribute('data-knee', 'left');
    // Перемычка — рисунок, а не содержимое: скринридеру она не нужна,
    // и остановкой табуляции быть не должна.
    expect(knees[0]).toHaveAttribute('aria-hidden', 'true');
    expect(knees[0]!.querySelector('path')).not.toBeNull();
  });

  it('обратная строка серпантина держит ось с той стороны, откуда пришла', () => {
    // Полуотрезки оси рисует сама версия, и в строке справа налево
    // предшественник лежит справа: иначе у последней версии набора ось
    // уходила бы в пустоту, а к предыдущей не вела.
    const { container } = render(
      <RoadmapTimeline versions={manyVersions(8)} currentIndex={0} form="serpentine" last={null} />,
    );
    const lines = Array.from(container.querySelectorAll('[data-version="v8"] line'));

    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveAttribute('x2', String(STEP));
  });

  it('строка серпантина перестраивается по измеренной ширине', () => {
    // Дефект 23: порог был выведен из 976 px внутреннего экрана, а
    // публичная страница даёт 720 — и лента молча уезжала в прокрутку.
    let notify: (() => void) | null = null;

    class Observer {
      constructor(callback: () => void) {
        notify = callback;
      }

      observe() {}

      unobserve() {}

      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', Observer);
    stubWidth(1200);

    const { container } = render(
      <RoadmapTimeline
        versions={manyVersions(24)}
        currentIndex={0}
        form="serpentine"
        last={null}
      />,
    );

    // (1200 − 48) / 96 = 12 столбцов, значит две строки и одно колено.
    expect(container.querySelectorAll('[data-knee]')).toHaveLength(1);

    stubWidth(400);
    act(() => notify!());

    // (400 − 48) / 96 = 3 столбца: восемь строк и семь колен.
    expect(container.querySelectorAll('[data-knee]')).toHaveLength(7);
  });

  it('длинный список режется окном и называет усечение словами', async () => {
    const count = LIST_WINDOW + 5;
    render(<ControlledTimeline count={count} />);

    expect(screen.getAllByText(/^v\d+$/)).toHaveLength(LIST_WINDOW);
    expect(screen.getByText(`Показаны ${LIST_WINDOW} из ${count}`)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Показать все' }));

    expect(screen.getAllByText(/^v\d+$/)).toHaveLength(count);
  });

  it('раскрытие обратимо', async () => {
    // Дефект 22: подвал с кнопкой исчезал по условию «есть скрытые», и
    // свернуть раскрытое было нечем.
    const count = LIST_WINDOW + 5;
    render(<ControlledTimeline count={count} />);

    await userEvent.click(screen.getByRole('button', { name: 'Показать все' }));
    expect(screen.getByText(`Показаны все ${count}`)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Свернуть' }));

    expect(screen.getAllByText(/^v\d+$/)).toHaveLength(10);
    expect(screen.getByText(`Показаны 10 из ${count}`)).toBeInTheDocument();
  });

  it('проп last режет набор до последних, а null показывает все', () => {
    const limited = render(
      <RoadmapTimeline versions={manyVersions(30)} currentIndex={null} form="strip" last={5} />,
    );

    expect(screen.getAllByText(/^v\d+$/)).toHaveLength(5);
    expect(screen.getByText('v30')).toBeInTheDocument();
    limited.unmount();

    render(
      <RoadmapTimeline versions={manyVersions(30)} currentIndex={null} form="strip" last={null} />,
    );

    expect(screen.getAllByText(/^v\d+$/)).toHaveLength(30);
    expect(screen.queryByRole('button', { name: 'Показать все' })).not.toBeInTheDocument();
  });

  it('у каждой версии ровно одна кнопка при любой укладке', async () => {
    // Сторож от соблазна отрендерить обе укладки и спрятать лишнюю
    // классом: это удвоило бы остановки табуляции и сломало бы внешние
    // тесты экрана ошибкой «найдено несколько элементов».
    const strip = render(
      <RoadmapTimeline versions={versions} currentIndex={1} onSelect={vi.fn()} />,
    );

    expect(screen.getAllByRole('button', { name: 'Версия v2.0' })).toHaveLength(1);
    strip.unmount();

    const list = render(
      <RoadmapTimeline
        versions={manyVersions(LIST_WINDOW + 5)}
        currentIndex={0}
        form="list"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('button', { name: 'Версия v1' })).toHaveLength(1);
    list.unmount();

    render(
      <RoadmapTimeline
        versions={manyVersions(13)}
        currentIndex={0}
        form="serpentine"
        last={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('button', { name: 'Версия v1' })).toHaveLength(1);
  });

  it('пустой роадмап объясняется словами', () => {
    render(<RoadmapTimeline versions={[]} currentIndex={null} />);

    expect(screen.getByText(/версий пока нет/i)).toBeInTheDocument();
  });

  it('показывает даты под названиями, не обрезая их', () => {
    render(<RoadmapTimeline versions={versions} currentIndex={1} />);

    expect(screen.getByText('15.06.2026')).toBeInTheDocument();
    // В ленте пояснение и число стоят двумя строками: вместе они шире шага,
    // и одной строкой дата обрезалась бы многоточием.
    expect(screen.getByText('ожидается')).toBeInTheDocument();
    expect(screen.getByText('01.12.2026')).toBeInTheDocument();
  });

  it('в списке дата остаётся одной строкой', () => {
    render(<RoadmapTimeline versions={manyVersions(5)} currentIndex={0} form="list" />);

    // Там ширины хватает, и разрывать строку незачем.
    expect(screen.getAllByText(/^ожидается \d{2}\.\d{2}\.\d{4}$/).length).toBeGreaterThan(0);
  });

  it('с onSelect колонки — кнопки, клик отдаёт id версии', async () => {
    const onSelect = vi.fn();
    render(<RoadmapTimeline versions={versions} currentIndex={1} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'Версия v2.0' }));

    expect(onSelect).toHaveBeenCalledWith('2');
  });

  it('кнопки версий доступны с клавиатуры', async () => {
    const onSelect = vi.fn();
    render(<RoadmapTimeline versions={versions} currentIndex={1} onSelect={onSelect} />);

    screen.getByRole('button', { name: 'Версия v1.0' }).focus();
    await userEvent.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledWith('1');
  });

  it('без onSelect кнопок версий нет', () => {
    render(<RoadmapTimeline versions={versions} currentIndex={1} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
