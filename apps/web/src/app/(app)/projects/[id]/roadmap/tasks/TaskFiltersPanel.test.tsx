import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TaskFiltersPanel } from './TaskFiltersPanel';

function setup(query = '') {
  const onApply = vi.fn();
  render(
    <TaskFiltersPanel
      tasks={[]}
      versions={[]}
      params={new URLSearchParams(query)}
      showTracker
      onApply={onApply}
    />,
  );
  return onApply;
}
async function open() {
  await userEvent.click(screen.getByRole('button', { name: /^Фильтры/ }));
}
describe('панель фильтров задач', () => {
  it('скрывает поля до открытия, применяет выбор одной кнопкой и сохраняет остальные параметры адреса', async () => {
    const apply = setup('tab=mine');
    expect(screen.queryByLabelText('Релиз')).not.toBeInTheDocument();
    await open();
    await userEvent.selectOptions(screen.getByLabelText('Релиз'), 'loose');
    await userEvent.type(screen.getByLabelText('Поиск задач'), 'оплата');
    expect(apply).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Применить фильтры' }));
    const params = apply.mock.calls[0]![0] as URLSearchParams;
    expect(params.get('tab')).toBe('mine');
    expect(params.get('release')).toBe('loose');
    expect(params.get('search')).toBe('оплата');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('отмена не меняет фильтры, повторное открытие восстанавливает применённые значения', async () => {
    const apply = setup('loose=true');
    await open();
    await userEvent.type(screen.getByLabelText('Поиск задач'), 'не сохранять');
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(apply).not.toHaveBeenCalled();
    await open();
    expect(screen.getByLabelText('Поиск задач')).toHaveValue('');
    expect(screen.getByLabelText('Релиз')).toHaveValue('loose');
  });
  it('не применяет перевёрнутый период и сбрасывает условия только после подтверждения', async () => {
    const apply = setup('status=done&tab=mine');
    await open();
    fireEvent.change(screen.getByLabelText('Срок от'), { target: { value: '2026-12-10' } });
    fireEvent.change(screen.getByLabelText('Срок до'), { target: { value: '2026-12-01' } });
    expect(screen.getByRole('button', { name: 'Применить фильтры' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Начало периода');
    await userEvent.click(screen.getByRole('button', { name: 'Сбросить' }));
    expect(apply).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Применить фильтры' }));
    expect((apply.mock.calls[0]![0] as URLSearchParams).toString()).toBe('tab=mine');
  });
});
