import { RoadmapVersionState } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LIST_WINDOW, STEP, STRIP_MAX_VERSIONS } from './constants';
import { RoadmapTimeline } from './RoadmapTimeline';
import { sectorPath } from './sector';

// Фикстура ровно из трёх версий — это укладка «лента»: порог укладки
// STRIP_MAX_VERSIONS = 10, и дорастив её до одиннадцати, тесты ниже
// получат список и перестанут находить SVG.
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

  it('счёт чекпоинтов стоит рядом с отметкой', () => {
    // Ради этого всё и затевалось: зажатый сектор говорит о состоянии,
    // а точное число — словами.
    render(<RoadmapTimeline versions={versions} currentIndex={1} />);

    expect(screen.getByText('1 из 2')).toBeInTheDocument();
    expect(screen.getByText('чекпоинтов нет')).toBeInTheDocument();
  });

  it('до порога — лента, за порогом — список', () => {
    const strip = render(
      <RoadmapTimeline versions={manyVersions(STRIP_MAX_VERSIONS)} currentIndex={0} />,
    );

    expect(strip.container.querySelector('[data-form="strip"]')).not.toBeNull();
    expect(strip.container.querySelectorAll('svg').length).toBe(STRIP_MAX_VERSIONS);
    strip.unmount();

    const list = render(
      <RoadmapTimeline versions={manyVersions(STRIP_MAX_VERSIONS + 1)} currentIndex={0} />,
    );

    expect(list.container.querySelector('[data-form="list"]')).not.toBeNull();
    expect(list.container.querySelectorAll('svg').length).toBe(0);
    expect(list.container.querySelectorAll('[data-fill]').length).toBeGreaterThan(0);
  });

  it('длинный список режется окном и называет усечение словами', async () => {
    const count = LIST_WINDOW + 5;
    render(<RoadmapTimeline versions={manyVersions(count)} currentIndex={count - 1} />);

    expect(screen.getAllByText(/^v\d+$/)).toHaveLength(LIST_WINDOW);
    expect(screen.getByText(`Показаны ${LIST_WINDOW} из ${count}`)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Показать все' }));

    expect(screen.getAllByText(/^v\d+$/)).toHaveLength(count);
    expect(screen.queryByText(/^Показаны /)).not.toBeInTheDocument();
  });

  it('у каждой версии ровно одна кнопка при любой укладке', async () => {
    // Сторож от соблазна отрендерить обе укладки и спрятать лишнюю
    // классом: это удвоило бы остановки табуляции и сломало бы внешние
    // тесты экрана ошибкой «найдено несколько элементов».
    const strip = render(<RoadmapTimeline versions={versions} currentIndex={1} onSelect={vi.fn()} />);

    expect(screen.getAllByRole('button', { name: 'Версия v2.0' })).toHaveLength(1);
    strip.unmount();

    render(
      <RoadmapTimeline
        versions={manyVersions(LIST_WINDOW + 5)}
        currentIndex={0}
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
    render(<RoadmapTimeline versions={manyVersions(STRIP_MAX_VERSIONS + 1)} currentIndex={0} />);

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
