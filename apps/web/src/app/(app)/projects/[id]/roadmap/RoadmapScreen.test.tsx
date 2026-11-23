import {
  AccessLevel,
  PlatformKind,
  PlatformReleaseState,
  RoadmapVersionState,
  Section,
} from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as hooks from '@/api/hooks';

import { RoadmapScreen } from './RoadmapScreen';

vi.mock('@/api/hooks');

/**
 * Роутер, который правда меняет адрес.
 *
 * Вид и открытая версия живут в параметрах адреса, поэтому заглушка с
 * пустыми `vi.fn()` показала бы экран, который никогда не перерисуется:
 * ни «панель открылась по ссылке», ни «закрылась» проверить было бы
 * нечем. Здесь `push`/`replace` переписывают параметры и будят
 * подписанные компоненты — как настоящая навигация Next.
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
    usePathname: () => '/projects/p1/roadmap',
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

const roadmap = {
  stage: { current: 1, total: 2 },
  versions: [
    {
      id: '1',
      label: 'v1.0',
      state: RoadmapVersionState.InProgress,
      plannedDate: null,
      releasedDate: null,
      position: 1,
      progress: { done: 0, total: 1 },
      releases: [],
      checkpoints: [{ id: 'c1', title: 'Оплата', isDone: false, position: 1, platformIds: [] }],
    },
    {
      id: '2',
      label: 'v2.0',
      state: RoadmapVersionState.Planned,
      plannedDate: null,
      releasedDate: null,
      position: 2,
      progress: { done: 0, total: 0 },
      releases: [],
      checkpoints: [],
    },
  ],
  summary: [
    {
      platform: { id: 'p2', kind: PlatformKind.Store, name: 'App Store', position: 1 },
      released: { versionId: '1', versionLabel: 'v1.0', buildLabel: null, date: '2026-03-14' },
      pending: [
        {
          versionId: '2',
          versionLabel: 'v2.0',
          buildLabel: null,
          date: null,
          state: PlatformReleaseState.InReview,
        },
      ],
    },
  ],
};

/** Успешный query-результат для мока. */
function query<T>(data: T) {
  return { data, isPending: false, isError: false } as never;
}

/** Бездействующая мутация для мока. */
function mutation() {
  return { mutate: vi.fn(), isPending: false, error: null } as never;
}

beforeEach(() => {
  setQuery('');
  vi.mocked(hooks.useQueryRoadmap).mockReturnValue(query(roadmap));
  vi.mocked(hooks.useQuerySections).mockReturnValue(
    query({ [Section.Roadmap]: AccessLevel.Write }),
  );
  vi.mocked(hooks.useQueryPublicLink).mockReturnValue(query(null));
  vi.mocked(hooks.useMutationCreateVersion).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationDeleteVersion).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationCreateCheckpoint).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationUpdateCheckpoint).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationDeleteCheckpoint).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationPublishRoadmap).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationUnpublishRoadmap).mockReturnValue(mutation());
  // Панель версии читает их `isPending` на рендере: автомок уронил бы экран.
  vi.mocked(hooks.useMutationSaveVersion).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationUpdateCheckpoint).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationReadLinkTitle).mockReturnValue(mutation());
  // Реестр задач панель читает мягко, но объект результата ей нужен:
  // автомок отдал бы `undefined` и уронил бы рендер.
  vi.mocked(hooks.useQueryTasks).mockReturnValue(query([]));
  vi.mocked(hooks.useMutationUpdatePlacedTask).mockReturnValue(mutation());
});

describe('RoadmapScreen', () => {
  it('версия на полосе ведёт на свой отчёт по релизу', () => {
    // Ссылка, а не кнопка: Ctrl+клик открывает отчёт в новой вкладке, а
    // адрес можно скопировать и прислать. Простой щелчок при этом
    // по-прежнему открывает панель версии — правка живёт в ней.
    render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    expect(screen.getByRole('link', { name: 'Версия v1.0' })).toHaveAttribute(
      'href',
      '/projects/p1/roadmap/versions/1',
    );
  });

  it('клик по версии открывает панель с её содержимым', async () => {
    render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    await userEvent.click(screen.getByRole('link', { name: 'Версия v1.0' }));

    expect(screen.getByRole('dialog', { name: 'v1.0' })).toBeInTheDocument();
    expect(screen.getByLabelText('Оплата')).toBeInTheDocument();
  });

  it('выбранная версия адресуема: она уходит в параметр адреса', async () => {
    // Иначе на открытую панель нечего послать ссылкой, и «назад» из неё
    // уводит с экрана целиком.
    render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    await userEvent.click(screen.getByRole('link', { name: 'Версия v2.0' }));

    expect(address.params.get('version')).toBe('2');
  });

  it('панель открывается прямо по ссылке с версией', () => {
    setQuery('version=2');
    render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    expect(screen.getByRole('dialog', { name: 'v2.0' })).toBeInTheDocument();
  });

  it('закрытие панели убирает версию из адреса', async () => {
    setQuery('version=1');
    render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    await userEvent.keyboard('{Escape}');

    expect(address.params.get('version')).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('после закрытия панели версии открывается панель создания', async () => {
    render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    await userEvent.click(screen.getByRole('link', { name: 'Версия v1.0' }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить версию' }));

    expect(screen.getByRole('dialog', { name: 'Новая версия' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'v1.0' })).not.toBeInTheDocument();
  });

  it('отправка формы создания вызывает мутацию и закрывает панель', async () => {
    // Мок сразу зовёт onSuccess — как успешный ответ сервера.
    const mutate = vi.fn((_input: unknown, options?: { onSuccess?: () => void }) =>
      options?.onSuccess?.(),
    );
    vi.mocked(hooks.useMutationCreateVersion).mockReturnValue(
      { mutate, isPending: false, error: null } as never,
    );
    render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    await userEvent.click(screen.getByRole('button', { name: 'Добавить версию' }));
    await userEvent.type(screen.getByLabelText('Обозначение'), 'v3.0');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'v3.0' }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(screen.queryByRole('dialog', { name: 'Новая версия' })).not.toBeInTheDocument();
  });

  it('панель закрывается, когда версия исчезла из данных', async () => {
    const { rerender } = render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    await userEvent.click(screen.getByRole('link', { name: 'Версия v1.0' }));
    expect(screen.getByRole('dialog', { name: 'v1.0' })).toBeInTheDocument();

    vi.mocked(hooks.useQueryRoadmap).mockReturnValue(
      query({ ...roadmap, versions: [roadmap.versions[1]!] }),
    );
    rerender(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('правки версии и выпуска уходят одной мутацией', async () => {
    // Для человека это один щелчок: паспорт и клетки платформ — одна
    // запись, и порядок запросов знает мутация, а не экран.
    const mutate = vi.fn();
    vi.mocked(hooks.useMutationSaveVersion).mockReturnValue(
      { mutate, isPending: false, error: null } as never,
    );
    render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    await userEvent.click(screen.getByRole('link', { name: 'Версия v1.0' }));
    await userEvent.type(screen.getByLabelText('Обозначение'), '1');
    await userEvent.selectOptions(
      screen.getByLabelText('Состояние App Store'),
      PlatformReleaseState.OnTest,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(mutate).toHaveBeenCalledWith({
      versionId: '1',
      patch: { label: 'v1.01' },
      ops: [
        {
          platformId: 'p2',
          kind: 'set',
          input: { state: PlatformReleaseState.OnTest, releasedDate: null, buildLabel: null },
        },
      ],
    });
  });

  it('другая версия открывается со своим черновиком', async () => {
    // Черновик живёт в состоянии панели, и без `key` правки первой версии
    // переехали бы на вторую.
    render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    await userEvent.click(screen.getByRole('link', { name: 'Версия v1.0' }));
    await userEvent.type(screen.getByLabelText('Обозначение'), '1');

    // Панель модальна: чтобы открыть другую версию, её сначала закрывают,
    // и несохранённый черновик по пути спрашивает подтверждение.
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть без сохранения' }));
    await userEvent.click(screen.getByRole('link', { name: 'Версия v2.0' }));

    expect(screen.getByLabelText('Обозначение')).toHaveValue('v2.0');
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });

  it('переключатель укладки переписывает адрес и полосу', async () => {
    const { container } = render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    await userEvent.click(screen.getByRole('button', { name: 'Список' }));

    expect(address.params.get('view')).toBe('list');
    expect(container.querySelector('[data-form="list"]')).not.toBeNull();
  });

  it('вид воспроизводится ссылкой', () => {
    setQuery('view=serpentine&last=all');
    const { container } = render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    expect(container.querySelector('[data-form="serpentine"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Все' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Серпантин' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('фильтр «последние 10 / все» тоже уходит в адрес', async () => {
    render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    await userEvent.click(screen.getByRole('button', { name: 'Все' }));
    expect(address.params.get('last')).toBe('all');

    await userEvent.click(screen.getByRole('button', { name: 'Последние 10' }));
    expect(address.params.get('last')).toBe('10');
  });

  it('подвал и верхний фильтр используют один предел из адреса', async () => {
    vi.mocked(hooks.useQueryRoadmap).mockReturnValue(query({ ...roadmap,
      versions: Array.from({ length: 21 }, (_, index) => ({ ...roadmap.versions[0]!, id: String(index + 1), label: `v${index + 1}` })),
    }));
    const { container, unmount } = render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Показать все' }));
    expect(address.params.get('last')).toBe('all');
    expect(screen.getByRole('button', { name: 'Все' })).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelectorAll('[data-item]')).toHaveLength(21);
    await userEvent.click(screen.getByRole('button', { name: 'Все' }));
    await userEvent.click(screen.getByRole('button', { name: 'Последние 10' }));
    expect(address.params.get('last')).toBe('10');
    expect(container.querySelectorAll('[data-item]')).toHaveLength(10);
    unmount();
    const reloaded = render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);
    expect(reloaded.container.querySelectorAll('[data-item]')).toHaveLength(10);
  });

  it('укладка по умолчанию — серпантин', () => {
    const { container } = render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    // Даже короткий роадмап использует основной вид карты.
    expect(container.querySelector('[data-form="serpentine"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Серпантин' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('без права записи нет кнопки добавления', () => {
    vi.mocked(hooks.useQuerySections).mockReturnValue(
      query({ [Section.Roadmap]: AccessLevel.Read }),
    );
    render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    expect(screen.queryByRole('button', { name: 'Добавить версию' })).not.toBeInTheDocument();
  });

  it('ставит сводку над диаграммой', () => {
    render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    const summary = screen.getByText('App Store');
    const timeline = screen.getByRole('group', { name: 'Диаграмма роадмапа' });

    // Сводка должна отвечать до того, как читатель дошёл до диаграммы.
    expect(
      summary.compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('подсказывает, где заводятся платформы, когда их нет', async () => {
    vi.mocked(hooks.useQueryRoadmap).mockReturnValue(query({ ...roadmap, summary: [] }));

    render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    expect(
      screen.getByRole('link', { name: /Платформы задаются в паспорте проекта/ }),
    ).toHaveAttribute('href', '/projects/p1');
  });

  it('без права записи о паспорте не подсказывает', () => {
    vi.mocked(hooks.useQueryRoadmap).mockReturnValue(query({ ...roadmap, summary: [] }));
    vi.mocked(hooks.useQuerySections).mockReturnValue(
      query({ [Section.Roadmap]: AccessLevel.Read }),
    );

    render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    expect(screen.queryByText(/Платформы задаются/)).not.toBeInTheDocument();
  });
});
