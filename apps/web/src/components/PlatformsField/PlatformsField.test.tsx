import { PlatformKind } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PlatformsField } from './PlatformsField';

describe('PlatformsField', () => {
  it('подсказка превращается в платформу', async () => {
    const onAdd = vi.fn();

    render(<PlatformsField platforms={[]} onAdd={onAdd} onRemove={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: '+ API' }));

    expect(onAdd).toHaveBeenCalledWith({ kind: PlatformKind.Server, name: 'API' });
  });

  it('не предлагает уже заведённое', () => {
    render(
      <PlatformsField
        platforms={[{ kind: PlatformKind.Server, name: 'API' }]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: '+ API' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Веб' })).toBeInTheDocument();
  });

  it('заводит свою платформу с выбранным видом', async () => {
    const onAdd = vi.fn();

    render(<PlatformsField platforms={[]} onAdd={onAdd} onRemove={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Своя платформа'), 'Galaxy Store');
    await userEvent.selectOptions(screen.getByLabelText('Вид'), PlatformKind.Store);
    await userEvent.click(screen.getByRole('button', { name: 'Добавить платформу' }));

    expect(onAdd).toHaveBeenCalledWith({ kind: PlatformKind.Store, name: 'Galaxy Store' });
  });

  it('снимает платформу целиком, а не по имени', async () => {
    // В режиме правки нужен идентификатор для мутации, и искать его
    // повторно по имени значило бы заводить второй способ сослаться
    // на строку.
    const onRemove = vi.fn();
    const platform = { id: 'p2', kind: PlatformKind.Store, name: 'RuStore' };

    render(<PlatformsField platforms={[platform]} onAdd={vi.fn()} onRemove={onRemove} />);

    await userEvent.click(screen.getByRole('button', { name: 'Убрать RuStore' }));

    expect(onRemove).toHaveBeenCalledWith(platform);
  });

  it('не отправляет пустое имя своей платформы', async () => {
    const onAdd = vi.fn();

    render(<PlatformsField platforms={[]} onAdd={onAdd} onRemove={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Добавить платформу' }));

    expect(onAdd).not.toHaveBeenCalled();
  });
});
