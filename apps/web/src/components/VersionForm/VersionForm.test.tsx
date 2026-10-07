import { RoadmapVersionState } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VersionForm } from './VersionForm';

const RELEASED = {
  label: 'v1.2',
  state: RoadmapVersionState.Released,
  plannedDate: null,
  releasedDate: '2026-03-14',
};

describe('VersionForm', () => {
  it('не отправляет форму без обозначения', async () => {
    const onSubmit = vi.fn();
    render(<VersionForm onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('отправляет обозначение, состояние и дату', async () => {
    const onSubmit = vi.fn();
    render(<VersionForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Обозначение'), 'v1.0');
    await userEvent.selectOptions(screen.getByLabelText('Состояние'), 'in_progress');
    await userEvent.type(screen.getByLabelText('Плановая дата'), '2026-12-01');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith({
      label: 'v1.0',
      state: RoadmapVersionState.InProgress,
      plannedDate: '2026-12-01',
      releasedDate: null,
    });
  });

  it('пустая дата уходит как отсутствие', async () => {
    const onSubmit = vi.fn();
    render(<VersionForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Обозначение'), 'v1.0');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ plannedDate: null }));
  });

  it('показывает ошибку сервера', () => {
    render(<VersionForm onSubmit={vi.fn()} error="Обозначение занято" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Обозначение занято');
  });

  it('поле даты релиза появляется только у выпущенной', async () => {
    render(<VersionForm onSubmit={vi.fn()} />);

    expect(screen.queryByLabelText('Дата релиза')).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Состояние'), 'released');

    expect(screen.getByLabelText('Дата релиза')).toBeInTheDocument();
  });

  it('переключение в «выпущена» подставляет сегодняшнюю дату', async () => {
    render(<VersionForm onSubmit={vi.fn()} />);

    await userEvent.selectOptions(screen.getByLabelText('Состояние'), 'released');

    const today = new Intl.DateTimeFormat('sv-SE').format(new Date());
    expect(screen.getByLabelText('Дата релиза')).toHaveValue(today);
  });

  it('отправляет дату релиза выпущенной версии', async () => {
    const onSubmit = vi.fn();
    render(<VersionForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Обозначение'), 'v1.0');
    await userEvent.selectOptions(screen.getByLabelText('Состояние'), 'released');
    await userEvent.clear(screen.getByLabelText('Дата релиза'));
    await userEvent.type(screen.getByLabelText('Дата релиза'), '2026-09-01');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ releasedDate: '2026-09-01' }),
    );
  });

  it('для невыпущенной отправляет releasedDate: null', async () => {
    const onSubmit = vi.fn();
    render(
      <VersionForm
        initial={{
          label: 'v1.0',
          state: RoadmapVersionState.Released,
          plannedDate: null,
          releasedDate: '2026-09-01',
        }}
        onSubmit={onSubmit}
      />,
    );

    await userEvent.selectOptions(screen.getByLabelText('Состояние'), 'planned');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ releasedDate: null }));
  });

  it('берёт дату релиза из initial', () => {
    render(
      <VersionForm
        initial={{
          label: 'v1.0',
          state: RoadmapVersionState.Released,
          plannedDate: null,
          releasedDate: '2026-09-01',
        }}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Дата релиза')).toHaveValue('2026-09-01');
  });

  it('скрывает дату релиза, когда у проекта есть платформы', () => {
    // Иначе вторая правда заводилась бы уже после того, как появилась
    // первая: дата живёт у выпусков.
    render(<VersionForm initial={RELEASED} onSubmit={vi.fn()} hasPlatforms />);

    expect(screen.queryByLabelText('Дата релиза')).not.toBeInTheDocument();
  });

  it('без платформ дата релиза по-прежнему есть', () => {
    render(<VersionForm initial={RELEASED} onSubmit={vi.fn()} />);

    expect(screen.getByLabelText('Дата релиза')).toBeInTheDocument();
  });

  it('при платформах не отправляет дату вовсе', async () => {
    // Ключа в запросе нет — хранимое значение не затирается. Поправить
    // его можно, записав фактический выход на платформе.
    const onSubmit = vi.fn();

    render(<VersionForm initial={RELEASED} onSubmit={onSubmit} hasPlatforms />);
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('releasedDate');
  });

  it('кнопка сохранения лежит в прилипшей полосе', () => {
    render(<VersionForm onSubmit={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Сохранить' }).parentElement).toHaveClass(
      'sticky',
    );
  });

  it('отмену показывает рядом с сохранением, когда есть куда возвращаться', async () => {
    // Раньше «Отмена» висела отдельной кнопкой под формой: два действия
    // одного выбора стояли в разных местах.
    const onCancel = vi.fn();

    render(<VersionForm onSubmit={vi.fn()} onCancel={onCancel} />);

    const cancel = screen.getByRole('button', { name: 'Отмена' });

    expect(cancel.parentElement).toHaveClass('sticky');

    await userEvent.click(cancel);

    expect(onCancel).toHaveBeenCalled();
  });

  it('без обработчика отмены кнопки нет', () => {
    render(<VersionForm onSubmit={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Отмена' })).not.toBeInTheDocument();
  });
});
