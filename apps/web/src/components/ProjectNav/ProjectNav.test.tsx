import { AccessLevel, Section } from '@cairn/shared';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProjectNav } from './ProjectNav';

const pathname = vi.hoisted(() => ({ value: '/projects/p1/variables' }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
}));

const sections: Partial<Record<Section, AccessLevel>> = {
  [Section.Info]: AccessLevel.Read,
  [Section.Infrastructure]: AccessLevel.Read,
  [Section.Variables]: AccessLevel.Metadata,
  [Section.Roadmap]: AccessLevel.Read,
};

function renderNav() {
  return render(<ProjectNav projectId="p1" projectName="Витрина" sections={sections} />);
}

describe('ProjectNav', () => {
  it('выделяет отдельную вкладку задач по тому же праву на роадмап', () => {
    pathname.value = '/projects/p1/tasks/settings';
    renderNav();
    const [breadcrumbs, tabs] = screen.getAllByRole('list');
    expect(within(breadcrumbs!).getByRole('link', { name: 'Задачи' })).toHaveAttribute(
      'href',
      '/projects/p1/tasks',
    );
    expect(within(tabs!).getByRole('link', { name: 'Задачи' })).toHaveClass('bg-surface-strong');
    expect(within(tabs!).getByRole('link', { name: 'Роадмап' })).not.toHaveClass(
      'bg-surface-strong',
    );
    pathname.value = '/projects/p1/variables';
  });
  it('не показывает задачи без доступа к роадмапу', () => {
    render(
      <ProjectNav
        projectId="p1"
        projectName="Проект"
        sections={{ [Section.Info]: AccessLevel.Read }}
      />,
    );
    expect(screen.queryByRole('link', { name: 'Задачи' })).not.toBeInTheDocument();
  });
  it('ведёт из раздела назад к проекту и к списку проектов', () => {
    // Без этого из раздела можно было выйти только кнопкой браузера.
    renderNav();

    expect(screen.getByRole('link', { name: 'Проекты' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Витрина' })).toHaveAttribute('href', '/projects/p1');
  });

  it('называет текущий раздел и в крошках, и в полосе разделов', () => {
    // Пометка стоит в обоих наборах: это два разных списка, и в каждом
    // «текущий» свой. Ссылкой текущий раздел не делается — щёлкать по месту,
    // где уже находишься, незачем.
    renderNav();

    const [breadcrumbs, tabs] = screen.getAllByRole('list');

    expect(within(breadcrumbs!).getByText('Переменные')).toHaveAttribute('aria-current', 'page');
    expect(within(tabs!).getByText('Переменные')).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Переменные' })).not.toBeInTheDocument();
  });

  it('показывает разделы, к которым есть доступ', () => {
    renderNav();

    expect(screen.getByRole('link', { name: 'Инфраструктура' })).toHaveAttribute(
      'href',
      '/projects/p1/infrastructure',
    );
  });

  it('не раскрывает разделы без доступа', () => {
    // Отсутствие выдачи означает, что существование секции не раскрывается (ТЗ 4.2).
    renderNav();

    expect(screen.queryByRole('link', { name: 'Хроника' })).not.toBeInTheDocument();
    expect(screen.queryByText('Хроника')).not.toBeInTheDocument();
  });

  it('на вложенном адресе раздел остаётся текущим и ведёт назад', () => {
    // Страница отчёта по релизу лежит внутри роадмапа. При точном
    // сравнении адреса «Роадмап» перестал быть текущим вовсе: ни пометки
    // места, ни звена в крошках — выйти можно было только к проекту.
    pathname.value = '/projects/p1/roadmap/versions/v1';
    renderNav();

    const [breadcrumbs, tabs] = screen.getAllByRole('list');

    expect(within(breadcrumbs!).getByRole('link', { name: 'Роадмап' })).toHaveAttribute(
      'href',
      '/projects/p1/roadmap',
    );
    expect(within(tabs!).getByRole('link', { name: 'Роадмап' })).toHaveAttribute(
      'href',
      '/projects/p1/roadmap',
    );
    // Текущая страница — отчёт, а не раздел: `aria-current` на звене пути
    // был бы неправдой.
    expect(within(tabs!).getByRole('link', { name: 'Роадмап' })).not.toHaveAttribute(
      'aria-current',
    );
    // Соседние разделы вложенный адрес себе не присваивают.
    expect(within(tabs!).getByRole('link', { name: 'Переменные' })).toBeInTheDocument();

    pathname.value = '/projects/p1/variables';
  });

  it('на карточке проекта его имя не ссылка, а текущее место', () => {
    pathname.value = '/projects/p1';
    renderNav();

    const [breadcrumbs] = screen.getAllByRole('list');

    expect(screen.queryByRole('link', { name: 'Витрина' })).not.toBeInTheDocument();
    expect(within(breadcrumbs!).getByText('Витрина')).toHaveAttribute('aria-current', 'page');

    pathname.value = '/projects/p1/variables';
  });
});
