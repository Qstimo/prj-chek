import { RoadmapVersionState } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RoadmapTimeline } from './RoadmapTimeline';
import { sectorPath } from './sector';

const versions = [
  {
    id: '1',
    label: 'v1.0',
    state: RoadmapVersionState.Released,
    progress: { done: 1, total: 3 },
  },
  {
    id: '2',
    label: 'v2.0',
    state: RoadmapVersionState.InProgress,
    progress: { done: 1, total: 2 },
  },
  {
    id: '3',
    label: 'v3.0',
    state: RoadmapVersionState.Planned,
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
});
