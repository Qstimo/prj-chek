import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Drawer } from './Drawer';

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
});
