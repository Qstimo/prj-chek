import { PlatformKind, RoadmapVersionState } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PublicRoadmapView } from './PublicRoadmapView';

/**
 * Роутер, который правда меняет адрес.
 *
 * Вид и открытая версия живут в параметрах адреса — и на публичной
 * странице это важнее всего: ссылкой делятся, и она обязана открываться
 * тем же видом, каким её прислали. С пустыми `vi.fn()` экран не
 * перерисовался бы, и проверить это было бы нечем.
 */
const { address, navigate, setQuery } = vi.hoisted(() => {
  const state = { params: new URLSearchParams(), listeners: new Set<() => void>() };

  return {
    address: state,
    setQuery: (search: string) => {
      state.params = new URLSearchParams(search);
    },
    navigate: (url: string) => {
      const mark = url.indexOf('?');

      state.params = new URLSearchParams(mark === -1 ? '' : url.slice(mark + 1));
      state.listeners.forEach((listener) => listener());
    },
  };
});

vi.mock('next/navigation', async () => {
  const { useEffect, useReducer } = await import('react');

  return {
    useRouter: () => ({ push: navigate, replace: navigate, refresh: vi.fn(), back: vi.fn() }),
    usePathname: () => '/roadmap/t0ken',
    useSearchParams: () => {
      const [, bump] = useReducer((value: number) => value + 1, 0);

      useEffect(() => {
        address.listeners.add(bump);

        return () => {
          address.listeners.delete(bump);
        };
      }, [bump]);

      return address.params;
    },
    notFound: vi.fn(),
    redirect: vi.fn(),
  };
});

/** Версия публичной выдачи: без ссылок на задачи — их наружу не отдают. */
function version(index: number) {
  return {
    id: String(index),
    label: `v${index}.0`,
    state: RoadmapVersionState.Planned,
    plannedDate: '2026-12-01',
    releasedDate: null,
    position: index,
    progress: { done: 0, total: 0 },
    unfinished: 0,
    hasUnfinishedOnRelease: false,
    releases: [],
    checkpoints: [],
  };
}

const roadmap = {
  projectName: 'Проект',
  stage: { current: 1, total: 1 },
  versions: [
    {
      id: '1',
      label: 'v1.0',
      state: RoadmapVersionState.InProgress,
      plannedDate: '2026-12-01',
      releasedDate: null,
      position: 1,
      progress: { done: 0, total: 1 },
      unfinished: 1,
      hasUnfinishedOnRelease: false,
      releases: [],
      checkpoints: [{ id: 'c1', title: 'Оплата', isDone: false, position: 1, platformIds: [] }],
    },
  ],
  summary: [
    {
      platform: { id: 'p1', kind: PlatformKind.Server, name: 'API', position: 1 },
      released: { versionId: '1', versionLabel: 'v1.2', buildLabel: null, date: '2026-03-14' },
      pending: [],
    },
  ],
};

beforeEach(() => {
  setQuery('');
});

describe('PublicRoadmapView', () => {
  it('клик по версии открывает панель просмотра', async () => {
    render(<PublicRoadmapView roadmap={roadmap} />);

    await userEvent.click(screen.getByRole('button', { name: 'Версия v1.0' }));

    expect(screen.getByRole('dialog', { name: 'v1.0' })).toBeInTheDocument();
    expect(screen.getByLabelText('Оплата')).toBeInTheDocument();
  });

  it('панель — только чтение', async () => {
    render(<PublicRoadmapView roadmap={roadmap} />);

    await userEvent.click(screen.getByRole('button', { name: 'Версия v1.0' }));

    expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Оплата')).toBeDisabled();
  });

  it('показывает сводку без адресов', () => {
    render(<PublicRoadmapView roadmap={roadmap} />);

    expect(screen.getByText('API')).toBeInTheDocument();
    expect(screen.getByText('в релизе v1.2')).toBeInTheDocument();
    expect(screen.queryByText(/example\.com/)).not.toBeInTheDocument();
  });

  it('выбранная версия адресуема, и панель открывается по ссылке', async () => {
    const { unmount } = render(<PublicRoadmapView roadmap={roadmap} />);

    await userEvent.click(screen.getByRole('button', { name: 'Версия v1.0' }));
    expect(address.params.get('version')).toBe('1');
    unmount();

    setQuery('version=1');
    render(<PublicRoadmapView roadmap={roadmap} />);

    expect(screen.getByRole('dialog', { name: 'v1.0' })).toBeInTheDocument();
  });

  it('переключатель вида есть и на публичной странице', async () => {
    // Место здесь уже внутреннего экрана (720 px против 976), и укладка
    // нужнее всего именно тут.
    const { container } = render(
      <PublicRoadmapView
        roadmap={{ ...roadmap, versions: Array.from({ length: 13 }, (_, i) => version(i + 1)) }}
      />,
    );

    expect(container.querySelector('[data-form="serpentine"]')).not.toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Список' }));

    expect(address.params.get('view')).toBe('list');
    expect(container.querySelector('[data-form="list"]')).not.toBeNull();
  });

  it('вид воспроизводится ссылкой', () => {
    setQuery('view=list&last=all');
    const { container } = render(
      <PublicRoadmapView
        roadmap={{ ...roadmap, versions: Array.from({ length: 13 }, (_, i) => version(i + 1)) }}
      />,
    );

    expect(container.querySelector('[data-form="list"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Все' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Показаны все 13')).toBeInTheDocument();
  });

  it('публичный подвал меняет URL и сворачивает тот же набор, что верхний фильтр', async () => {
    const data = { ...roadmap, versions: Array.from({ length: 21 }, (_, i) => version(i + 1)) };
    const { container, unmount } = render(<PublicRoadmapView roadmap={data} />);
    await userEvent.click(screen.getByRole('button', { name: 'Показать все' }));
    expect(address.params.get('last')).toBe('all');
    expect(container.querySelectorAll('[data-item]')).toHaveLength(21);
    await userEvent.click(screen.getByRole('button', { name: 'Все' }));
    await userEvent.click(screen.getByRole('button', { name: 'Последние 10' }));
    expect(container.querySelectorAll('[data-item]')).toHaveLength(10);
    await userEvent.click(screen.getByRole('button', { name: 'Показать все' }));
    await userEvent.click(screen.getByRole('button', { name: 'Свернуть' }));
    expect(address.params.get('last')).toBe('10');
    expect(container.querySelectorAll('[data-item]')).toHaveLength(10);
    unmount();
    const reloaded = render(<PublicRoadmapView roadmap={data} />);
    expect(reloaded.container.querySelectorAll('[data-item]')).toHaveLength(10);
  });
});
