import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Drawer } from './Drawer';
import { DrawerWidth } from './types';

describe('Drawer', () => {
  it('закрытая панель не рендерится', () => {
    render(
      <Drawer isOpen={false} onClose={vi.fn()} title="Панель">
        содержимое
      </Drawer>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('открытая панель показывает заголовок и содержимое', () => {
    render(
      <Drawer isOpen onClose={vi.fn()} title="Панель">
        содержимое
      </Drawer>,
    );

    expect(screen.getByRole('dialog', { name: 'Панель' })).toBeInTheDocument();
    expect(screen.getByText('содержимое')).toBeInTheDocument();
  });

  it('закрывается крестиком', async () => {
    const onClose = vi.fn();
    render(
      <Drawer isOpen onClose={onClose} title="Панель">
        содержимое
      </Drawer>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('закрывается по Esc', async () => {
    const onClose = vi.fn();
    render(
      <Drawer isOpen onClose={onClose} title="Панель">
        содержимое
      </Drawer>,
    );

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  it('открывается широкой, когда попрошена ширина панели роадмапа', () => {
    render(
      <Drawer isOpen onClose={vi.fn()} title="Панель" width={DrawerWidth.Wide}>
        содержимое
      </Drawer>,
    );

    expect(screen.getByRole('dialog')).toHaveClass('max-w-[640px]');
  });

  it('по умолчанию остаётся узкой', () => {
    render(
      <Drawer isOpen onClose={vi.fn()} title="Панель">
        содержимое
      </Drawer>,
    );

    expect(screen.getByRole('dialog')).toHaveClass('max-w-[480px]');
  });

  it('показывает действия в шапке рядом с закрытием', () => {
    // Кнопка сохранения панели версии живёт наверху и обязана оставаться
    // на виду при прокрутке — значит в шапке, а не в содержимом.
    render(
      <Drawer
        isOpen
        onClose={vi.fn()}
        title="Панель"
        actions={<button type="button">Сохранить</button>}
      >
        содержимое
      </Drawer>,
    );

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeInTheDocument();
  });

  it('половинная ширина не сжимает панель ни на телефоне, ни на планшете', () => {
    // На телефоне ограничения быть не должно вовсе, а 50vw на планшете —
    // это 384px, уже нынешних 480px: «половина экрана» обернулась бы
    // сужением.
    render(
      <Drawer isOpen onClose={vi.fn()} title="Панель" width={DrawerWidth.Half}>
        содержимое
      </Drawer>,
    );

    const dialog = screen.getByRole('dialog');

    expect(dialog).toHaveClass('md:max-w-[max(480px,50vw)]');
    expect(dialog.className).not.toMatch(/(^|\s)max-w-/);
  });
});
