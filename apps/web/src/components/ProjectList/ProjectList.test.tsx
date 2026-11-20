import { ProjectLifecycle, type ProjectListItem, type Tag } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectList } from './ProjectList';
import { PROJECT_LIST_VIEW_KEY } from './viewStorage';

/**
 * Роутер, который правда меняет адрес.
 *
 * Выбранные теги живут в параметрах адреса, и заглушка с пустыми
 * `vi.fn()` показала бы список, который никогда не перерисуется: ни
 * «щёлкнули по тегу», ни «пришли по ссылке» проверить было бы нечем.
 * Повторён с экрана роадмапа, где адрес держит вид полосы, — выносить
 * его в общий помощник рано: третьего потребителя пока нет.
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
    usePathname: () => '/',
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
  };
});

const WEB: Tag = { id: 't1', slug: 'web', label: 'Web' };
const PRODUCT: Tag = { id: 't2', slug: 'product', label: 'Product' };

/** Строка сводки. */
function item(name: string, tags: Tag[] = []): ProjectListItem {
  return {
    id: name,
    slug: name,
    name,
    lifecycle: ProjectLifecycle.Active,
    updatedAt: null,
    platforms: [],
    tags,
    productionDomain: 'example.com',
    productionServerName: null,
  };
}

const project = item('Проект');

beforeEach(() => {
  setQuery('');
  window.localStorage.clear();
});

describe('ProjectList', () => {
  it('по умолчанию показывает строки с доменом', () => {
    render(<ProjectList projects={[project]} />);

    expect(screen.getByText('Проект')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Название' })).toBeInTheDocument();
  });

  it('ссылка проекта растянута на всю строку', () => {
    // Человек целит в строку, а не в клетку названия: в состояние, в
    // статус, в дату. Ссылка остаётся одна и настоящая — работают и
    // клавиатура, и «открыть в новой вкладке».
    render(<ProjectList projects={[project]} />);

    expect(screen.getByRole('link', { name: 'Проект' }).className).toMatch(/after:inset-0/);
  });

  it('таблица укладывается в своё место, а не прокручивается боком', () => {
    // Таблица требовала 64rem в контейнере на 61rem, поэтому сводка
    // ехала вправо на любом экране. Ширины задаются долями, а длинные
    // значения обрезаются.
    render(<ProjectList projects={[project]} />);

    const table = screen.getByRole('table');

    expect(table.className).toMatch(/table-fixed/);
    expect(table.className).not.toMatch(/min-w-/);
  });

  it('переключает на карточки и запоминает выбор', async () => {
    const user = userEvent.setup();
    render(<ProjectList projects={[project]} />);

    await user.click(screen.getByRole('button', { name: 'Карточки' }));

    expect(screen.queryByRole('columnheader', { name: 'Название' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(PROJECT_LIST_VIEW_KEY)).toBe('cards');
  });

  it('объясняет пустой список отсутствием выданных доступов', () => {
    // Пустая страница без объяснения выглядит как поломка, хотя это
    // нормальное состояние для нового пользователя (ТЗ 4.1).
    render(<ProjectList projects={[]} />);

    expect(screen.getByText(/доступ/i)).toBeInTheDocument();
  });

  it('показывает орган создания, когда он передан', () => {
    // Слот, а не флаг: кнопка открывает панель, и список из-за этого
    // не обязан читать предпочтение вида на сервере.
    render(
      <ProjectList
        projects={[project]}
        createSlot={<button type="button">Создать проект</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Создать проект' })).toBeInTheDocument();
  });

  it('без слота создание не предлагает', () => {
    render(<ProjectList projects={[project]} />);

    expect(screen.queryByRole('button', { name: 'Создать проект' })).not.toBeInTheDocument();
  });

  it('в пустой системе зовёт суперадмина завести первый проект', () => {
    // Иначе администратор в пустой системе решит, что ему не выдали доступ,
    // хотя выдавать его некому и незачем.
    render(
      <ProjectList projects={[]} createSlot={<button type="button">Создать проект</button>} />,
    );

    expect(screen.getByRole('button', { name: 'Создать проект' })).toBeInTheDocument();
    expect(screen.queryByText(/доступ к проектам выдаёт/i)).not.toBeInTheDocument();
  });

  describe('фильтр по тегам', () => {
    it('без тегов полосы фильтра нет вовсе', () => {
      render(<ProjectList projects={[project]} />);

      expect(screen.queryByRole('group', { name: 'Фильтр по тегам' })).not.toBeInTheDocument();
    });

    it('собирает кнопки из тегов сводки с подсчётом', () => {
      render(<ProjectList projects={[item('Касса', [WEB]), item('Витрина', [WEB, PRODUCT])]} />);

      expect(screen.getByRole('button', { name: /^Web/ })).toHaveTextContent('2');
      expect(screen.getByRole('button', { name: /^Product/ })).toHaveTextContent('1');
    });

    it('щелчок по тегу оставляет только помеченные им', async () => {
      const user = userEvent.setup();
      render(<ProjectList projects={[item('Касса', [WEB]), item('Бот')]} />);

      await user.click(screen.getByRole('button', { name: /^Web/ }));

      expect(screen.getByText('Касса')).toBeInTheDocument();
      expect(screen.queryByText('Бот')).not.toBeInTheDocument();
    });

    it('выбор уходит в адрес, а не в состояние экрана', async () => {
      // Отобранный список обязан пересылаться ссылкой и выживать
      // перезагрузку.
      const user = userEvent.setup();
      render(<ProjectList projects={[item('Касса', [WEB])]} />);

      await user.click(screen.getByRole('button', { name: /^Web/ }));

      expect(address.params.getAll('tag')).toEqual(['web']);
    });

    it('читает выбор из адреса при открытии по ссылке', () => {
      setQuery('tag=web');
      render(<ProjectList projects={[item('Касса', [WEB]), item('Бот')]} />);

      expect(screen.getByRole('button', { name: /^Web/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.queryByText('Бот')).not.toBeInTheDocument();
    });

    it('два тега отбирают пересечение', () => {
      setQuery('tag=web&tag=product');
      render(<ProjectList projects={[item('Касса', [WEB]), item('Витрина', [WEB, PRODUCT])]} />);

      expect(screen.getByText('Витрина')).toBeInTheDocument();
      expect(screen.queryByText('Касса')).not.toBeInTheDocument();
    });

    it('выбранный тег не исчезает из полосы фильтра', async () => {
      // Кнопки собираются из всей сводки, а не из отобранного: иначе
      // выбранный тег убрал бы из полосы сам себя, и снять его было бы
      // нечем.
      const user = userEvent.setup();
      render(<ProjectList projects={[item('Касса', [WEB]), item('Витрина', [PRODUCT])]} />);

      await user.click(screen.getByRole('button', { name: /^Web/ }));

      expect(screen.getByRole('button', { name: /^Web/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Product/ })).toBeInTheDocument();
    });

    it('«Все» снимает отбор', async () => {
      const user = userEvent.setup();
      setQuery('tag=web');
      render(<ProjectList projects={[item('Касса', [WEB]), item('Бот')]} />);

      await user.click(screen.getByRole('button', { name: 'Все' }));

      expect(screen.getByText('Бот')).toBeInTheDocument();
      expect(address.params.getAll('tag')).toEqual([]);
    });

    it('пустой отбор объясняет себя фильтром, а не отсутствием доступа', () => {
      setQuery('tag=нет-такого');
      render(<ProjectList projects={[item('Касса', [WEB])]} />);

      expect(screen.getByText(/не подходит ни один проект/i)).toBeInTheDocument();
      expect(screen.queryByText(/доступ к проектам выдаёт/i)).not.toBeInTheDocument();
    });
  });
});
