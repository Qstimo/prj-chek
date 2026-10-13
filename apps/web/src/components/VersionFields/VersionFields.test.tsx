import { RoadmapVersionState } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VersionFields } from './VersionFields';
import type { IVersionPassportDraft } from './types';

const DRAFT: IVersionPassportDraft = {
  label: 'v1.2',
  state: RoadmapVersionState.Planned,
  plannedDate: '',
  releasedDate: '',
};

const RELEASED: IVersionPassportDraft = {
  ...DRAFT,
  state: RoadmapVersionState.Released,
  releasedDate: '2026-03-14',
};

describe('VersionFields', () => {
  it('показывает обозначение, состояние и плановую дату', () => {
    render(<VersionFields draft={DRAFT} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Обозначение')).toHaveValue('v1.2');
    expect(screen.getByLabelText('Состояние')).toHaveValue(RoadmapVersionState.Planned);
    expect(screen.getByLabelText('Плановая дата')).toBeInTheDocument();
  });

  it('правка поля отдаёт черновик целиком', async () => {
    const onChange = vi.fn();
    render(<VersionFields draft={DRAFT} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Обозначение'), '3');

    expect(onChange).toHaveBeenCalledWith({ ...DRAFT, label: 'v1.23' });
  });

  it('переключение в «выпущена» подставляет сегодняшнюю дату', async () => {
    const onChange = vi.fn();
    render(<VersionFields draft={DRAFT} onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText('Состояние'), 'released');

    expect(onChange).toHaveBeenCalledWith({
      ...DRAFT,
      state: RoadmapVersionState.Released,
      releasedDate: new Intl.DateTimeFormat('sv-SE').format(new Date()),
    });
  });

  it('заполненную дату релиза не затирает', async () => {
    const onChange = vi.fn();
    render(
      <VersionFields
        draft={{ ...RELEASED, state: RoadmapVersionState.Planned }}
        onChange={onChange}
      />,
    );

    await userEvent.selectOptions(screen.getByLabelText('Состояние'), 'released');

    expect(onChange).toHaveBeenCalledWith({
      ...RELEASED,
      state: RoadmapVersionState.Released,
      releasedDate: '2026-03-14',
    });
  });

  it('дата релиза видна только у выпущенной', () => {
    render(<VersionFields draft={DRAFT} onChange={vi.fn()} />);

    expect(screen.queryByLabelText('Дата релиза')).not.toBeInTheDocument();
  });

  it('при платформах даты релиза нет даже у выпущенной', () => {
    // Дата живёт у выпусков платформ, и второго места для неё нет.
    render(<VersionFields draft={RELEASED} onChange={vi.fn()} hasPlatforms />);

    expect(screen.queryByLabelText('Дата релиза')).not.toBeInTheDocument();
  });

  it('без платформ дата релиза у выпущенной есть', () => {
    render(<VersionFields draft={RELEASED} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Дата релиза')).toHaveValue('2026-03-14');
  });
});
