import { RoadmapVersionState } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RoadmapTimeline } from './RoadmapTimeline';
import { sectorPath } from './sector';

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

  it('подписи живут вне SVG, чтобы длинные названия переносились', () => {
    const long = [
      {
        id: '1',
        label: 'v1.1 — оплата',
        state: RoadmapVersionState.Released,
        plannedDate: null,
        releasedDate: null,
        progress: { done: 1, total: 1 },
      },
      {
        id: '2',
        label: 'v2.0 — маркетплейс',
        state: RoadmapVersionState.Planned,
        plannedDate: null,
        releasedDate: null,
        progress: { done: 0, total: 0 },
      },
    ];
    const { container } = render(<RoadmapTimeline versions={long} currentIndex={0} />);

    // В SVG текст не переносится и налезает на соседей; подписи — в HTML.
    expect(container.querySelector('svg text')).toBeNull();
    expect(screen.getByText('v2.0 — маркетплейс')).toBeInTheDocument();
  });

  it('выпущенная версия — полный круг независимо от чекпоинтов', () => {
    const { container } = render(<RoadmapTimeline versions={versions} currentIndex={1} />);

    const released = container.querySelector('[data-version="v1.0"] [data-fill="full"]');
    expect(released).not.toBeNull();
  });

  it('текущая версия выделена кольцом', () => {
    const { container } = render(<RoadmapTimeline versions={versions} currentIndex={1} />);

    const current = container.querySelector('[data-version="v2.0"][data-current="true"]');
    expect(current).not.toBeNull();
    expect(container.querySelector('[data-version="v1.0"][data-current="true"]')).toBeNull();
  });

  it('пустой роадмап объясняется словами', () => {
    render(<RoadmapTimeline versions={[]} currentIndex={null} />);

    expect(screen.getByText(/версий пока нет/i)).toBeInTheDocument();
  });

  it('показывает даты под названиями', () => {
    render(<RoadmapTimeline versions={versions} currentIndex={1} />);

    expect(screen.getByText('15.06.2026')).toBeInTheDocument();
    expect(screen.getByText('ожидается 01.12.2026')).toBeInTheDocument();
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

  it('без onSelect кнопок нет', () => {
    render(<RoadmapTimeline versions={versions} currentIndex={1} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
