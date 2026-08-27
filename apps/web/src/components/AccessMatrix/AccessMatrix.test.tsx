import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AccessMatrix } from './AccessMatrix';

const rows = [
  {
    subjectId: '11111111-1111-1111-1111-111111111111',
    subjectKind: SubjectKind.User,
    subjectLabel: 'user@cairn.local',
    isRevoked: false,
    levels: { [Section.Info]: AccessLevel.Read },
  },
];

describe('AccessMatrix', () => {
  it('показывает все шесть секций', () => {
    // Выдать доступ к будущей секции можно до её реализации (спека 4.3).
    render(<AccessMatrix rows={rows} onChange={vi.fn()} />);

    expect(screen.getAllByRole('columnheader')).toHaveLength(7);
  });

  it('показывает текущий уровень', () => {
    render(<AccessMatrix rows={rows} onChange={vi.fn()} />);

    expect(screen.getByLabelText('user@cairn.local, Инфо')).toHaveValue(AccessLevel.Read);
  });

  it('передаёт изменение уровня', async () => {
    const onChange = vi.fn();
    render(<AccessMatrix rows={rows} onChange={onChange} />);

    await userEvent.selectOptions(
      screen.getByLabelText('user@cairn.local, Инфо'),
      AccessLevel.Write,
    );

    expect(onChange).toHaveBeenCalledWith({
      subjectId: rows[0]!.subjectId,
      section: Section.Info,
      level: AccessLevel.Write,
    });
  });

  it('передаёт отзыв доступа как пустой уровень', async () => {
    const onChange = vi.fn();
    render(<AccessMatrix rows={rows} onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText('user@cairn.local, Инфо'), '');

    expect(onChange).toHaveBeenCalledWith({
      subjectId: rows[0]!.subjectId,
      section: Section.Info,
      level: null,
    });
  });

  it('показывает отсутствие доступа пустым значением', () => {
    render(<AccessMatrix rows={rows} onChange={vi.fn()} />);

    expect(screen.getByLabelText('user@cairn.local, Документация')).toHaveValue('');
  });

  it('помечает отозванных субъектов', () => {
    render(<AccessMatrix rows={[{ ...rows[0]!, isRevoked: true }]} onChange={vi.fn()} />);

    expect(screen.getByText(/отозван/i)).toBeInTheDocument();
  });

  it('объясняет пустую матрицу', () => {
    render(<AccessMatrix rows={[]} onChange={vi.fn()} />);

    expect(screen.getByText(/никому не выдан/i)).toBeInTheDocument();
  });
});
