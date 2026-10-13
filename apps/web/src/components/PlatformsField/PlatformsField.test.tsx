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
    await userEvent.click(screen.getByRole('button', { name: 'Да, убрать' }));

    expect(onRemove).toHaveBeenCalledWith(platform);
  });

  it('заведённая платформа не убирается с первого щелчка', async () => {
    // Вместе с платформой исчезают её выпуски во всех версиях — а это
    // единственное место, где живут фактические даты релизов.
    const onRemove = vi.fn();
    const platform = { id: 'p2', kind: PlatformKind.Store, name: 'RuStore' };

    render(<PlatformsField platforms={[platform]} onAdd={vi.fn()} onRemove={onRemove} />);

    await userEvent.click(screen.getByRole('button', { name: 'Убрать RuStore' }));

    expect(onRemove).not.toHaveBeenCalled();

    const confirm = screen.getByRole('dialog', { name: 'Подтверждение удаления платформы' });

    expect(confirm).toHaveTextContent('RuStore');
    expect(confirm).toHaveTextContent(/выпуски/);
  });

  it('отмена оставляет платформу на месте', async () => {
    const onRemove = vi.fn();
    const platform = { id: 'p2', kind: PlatformKind.Store, name: 'RuStore' };

    render(<PlatformsField platforms={[platform]} onAdd={vi.fn()} onRemove={onRemove} />);

    await userEvent.click(screen.getByRole('button', { name: 'Убрать RuStore' }));
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('незаписанный чип убирается сразу', async () => {
    // В панели создания проекта платформы ещё нет на сервере: терять
    // нечего, и спрашивать не о чем.
    const onRemove = vi.fn();
    const platform = { kind: PlatformKind.Store, name: 'RuStore' };

    render(<PlatformsField platforms={[platform]} onAdd={vi.fn()} onRemove={onRemove} />);

    await userEvent.click(screen.getByRole('button', { name: 'Убрать RuStore' }));

    expect(onRemove).toHaveBeenCalledWith(platform);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('не отправляет пустое имя своей платформы', async () => {
    const onAdd = vi.fn();

    render(<PlatformsField platforms={[]} onAdd={onAdd} onRemove={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Добавить платформу' }));

    expect(onAdd).not.toHaveBeenCalled();
  });
});
