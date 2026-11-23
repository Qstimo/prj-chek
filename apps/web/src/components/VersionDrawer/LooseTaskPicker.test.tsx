import { TaskOrigin, type ProjectTask } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LooseTaskPicker } from './LooseTaskPicker';

/** Задача вне версии: только такие сюда и приходят. */
const task: ProjectTask = {
  id: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
  title: 'Ждёт в реестре',
  url: null,
  origin: TaskOrigin.Manual,
  sourceSummaryId: null,
  platformIds: [],
  placement: null,
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
};

const second: ProjectTask = { ...task, id: '33333333-3333-4333-8333-333333333333', title: 'Вторая' };

describe('выбор задачи из реестра', () => {
  it('до нажатия ничего не отправляет', async () => {
    // Селект — не кнопка: щелчок по списку не обязан менять роадмап.
    const onPick = vi.fn();

    render(<LooseTaskPicker tasks={[task, second]} onPick={onPick} />);

    await userEvent.selectOptions(screen.getByLabelText('Взять задачу из реестра'), task.id);

    expect(onPick).not.toHaveBeenCalled();
  });

  it('отправляет выбранную задачу и сбрасывает выбор', async () => {
    // Сброс не косметика: та же задача второй раз не положится, сервер
    // ответил бы `409`, и оставлять её выбранной значило бы предлагать
    // действие, которое уже отказано.
    const onPick = vi.fn();

    render(<LooseTaskPicker tasks={[task, second]} onPick={onPick} />);

    await userEvent.selectOptions(screen.getByLabelText('Взять задачу из реестра'), second.id);
    await userEvent.click(screen.getByRole('button', { name: 'Добавить в версию' }));

    expect(onPick).toHaveBeenCalledWith(second.id);
    expect(screen.getByLabelText('Взять задачу из реестра')).toHaveValue('');
  });

  it('без выбора кнопка не нажимается', async () => {
    render(<LooseTaskPicker tasks={[task]} onPick={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Добавить в версию' })).toBeDisabled();
  });

  it('пока запрос в полёте, второй раз не отправляет', async () => {
    render(<LooseTaskPicker tasks={[task]} onPick={vi.fn()} isSubmitting />);

    await userEvent.selectOptions(screen.getByLabelText('Взять задачу из реестра'), task.id);

    expect(screen.getByRole('button', { name: 'Добавить в версию' })).toBeDisabled();
  });
});
