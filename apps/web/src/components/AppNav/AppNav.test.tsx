import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppNav } from './AppNav';

const subject = {
  id: '11111111-1111-1111-1111-111111111111',
  label: 'user@cairn.local',
  isSuperadmin: false,
  isTotpEnabled: false,
};

describe('AppNav', () => {
  it('показывает ссылку на проекты всем', () => {
    render(<AppNav subject={subject} onLogout={vi.fn()} />);

    expect(screen.getByRole('link', { name: 'Проекты' })).toBeInTheDocument();
  });

  it('показывает вкладку «Саммари» обычному пользователю', () => {
    // Поток нужен не администратору, а тому, кто ведёт проект: пункт
    // живёт в COMMON_LINKS. Прятать его по выдачам значило бы считать
    // права при отрисовке навигации, а пустой экран ничего не раскрывает.
    render(<AppNav subject={subject} onLogout={vi.fn()} />);

    expect(screen.getByRole('link', { name: 'Саммари' })).toHaveAttribute('href', '/summaries');
  });

  it('в пунктах суперадмина её нет второй раз', () => {
    render(<AppNav subject={{ ...subject, isSuperadmin: true }} onLogout={vi.fn()} />);

    expect(screen.getAllByRole('link', { name: 'Саммари' })).toHaveLength(1);
  });

  it('не показывает разделы администрирования обычному пользователю', () => {
    render(<AppNav subject={subject} onLogout={vi.fn()} />);

    expect(screen.queryByRole('link', { name: 'Пользователи' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Журнал' })).not.toBeInTheDocument();
  });

  it('показывает разделы администрирования суперадмину', () => {
    render(<AppNav subject={{ ...subject, isSuperadmin: true }} onLogout={vi.fn()} />);

    expect(screen.getByRole('link', { name: 'Пользователи' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Журнал' })).toBeInTheDocument();
  });

  it('показывает, кто вошёл', () => {
    render(<AppNav subject={subject} onLogout={vi.fn()} />);

    expect(screen.getByText('user@cairn.local')).toBeInTheDocument();
  });

  it('вызывает выход', async () => {
    const onLogout = vi.fn();
    render(<AppNav subject={subject} onLogout={onLogout} />);

    await userEvent.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(onLogout).toHaveBeenCalled();
  });

  describe('меню на телефоне', () => {
    // Разделы и выход в полосе скрыты правилом `sm:`, а media queries
    // Tailwind в jsdom не применяются. Поэтому проверяется поведение
    // меню — то, что от раскладки не зависит; сама раскладка смотрится
    // глазами.

    it('закрытым меню ничего не задваивает', async () => {
      // Разметка панели появляется только открытой, иначе «Проекты»
      // и «Выйти» были бы в документе дважды всегда.
      render(<AppNav subject={{ ...subject, isSuperadmin: true }} onLogout={vi.fn()} />);

      expect(screen.getAllByRole('link', { name: 'Проекты' })).toHaveLength(1);
      expect(screen.getAllByRole('button', { name: 'Выйти' })).toHaveLength(1);
    });

    it('открывает меню с разделами и выходом', async () => {
      render(<AppNav subject={{ ...subject, isSuperadmin: true }} onLogout={vi.fn()} />);

      await userEvent.click(screen.getByRole('button', { name: 'Меню' }));

      const menu = within(screen.getByRole('dialog', { name: 'Меню' }));

      expect(menu.getByRole('link', { name: 'Проекты' })).toBeInTheDocument();
      expect(menu.getByRole('link', { name: 'Журнал' })).toBeInTheDocument();
      expect(menu.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
      expect(menu.getByText('user@cairn.local')).toBeInTheDocument();
    });

    it('выход из меню вызывает выход', async () => {
      const onLogout = vi.fn();
      render(<AppNav subject={subject} onLogout={onLogout} />);

      await userEvent.click(screen.getByRole('button', { name: 'Меню' }));
      const menu = within(screen.getByRole('dialog', { name: 'Меню' }));
      await userEvent.click(menu.getByRole('button', { name: 'Выйти' }));

      expect(onLogout).toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('переход по разделу закрывает меню', async () => {
      // Навигация живёт в разметке раздела и смену страницы переживает,
      // поэтому панель сама не закроется и осталась бы висеть поверх
      // того, куда только что перешли.
      render(<AppNav subject={subject} onLogout={vi.fn()} />);

      await userEvent.click(screen.getByRole('button', { name: 'Меню' }));
      const menu = within(screen.getByRole('dialog', { name: 'Меню' }));
      await userEvent.click(menu.getByRole('link', { name: 'Проекты' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('размечен как навигация', () => {
    render(<AppNav subject={subject} onLogout={vi.fn()} />);

    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});
