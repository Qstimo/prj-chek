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

  it('показывает адрес рядом с именем', () => {
    // Имена не уникальны и правятся свободно: двух тёзок в этой таблице
    // различает только логин, а перепутать их здесь дороже всего.
    render(
      <AccessMatrix
        rows={[{ ...rows[0]!, subjectLabel: 'Иван Петров', subjectEmail: 'ivan@cairn.local' }]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Иван Петров')).toBeInTheDocument();
    expect(screen.getByText('ivan@cairn.local')).toBeInTheDocument();
  });

  it('различает тёзок по адресу в подписи селекта', () => {
    render(
      <AccessMatrix
        rows={[
          {
            ...rows[0]!,
            subjectId: '33333333-3333-3333-3333-333333333333',
            subjectLabel: 'Иван Петров',
            subjectEmail: 'first@cairn.local',
          },
          {
            ...rows[0]!,
            subjectId: '44444444-4444-4444-4444-444444444444',
            subjectLabel: 'Иван Петров',
            subjectEmail: 'second@cairn.local',
          },
        ]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('first@cairn.local, Инфо')).toBeInTheDocument();
    expect(screen.getByLabelText('second@cairn.local, Инфо')).toBeInTheDocument();
  });

  it('у суперадмина показывает полный доступ вместо селектов', () => {
    // Селекты предлагали выдать доступ, который ничего не меняет:
    // суперадмин обходит выдачи, не доходя до таблицы.
    render(<AccessMatrix rows={[{ ...rows[0]!, isSuperadmin: true }]} onChange={vi.fn()} />);

    expect(screen.getByText('Полный доступ')).toBeInTheDocument();
    expect(screen.queryByLabelText('user@cairn.local, Инфо')).not.toBeInTheDocument();
  });

  it('объясняет пустую матрицу', () => {
    render(<AccessMatrix rows={[]} onChange={vi.fn()} />);

    expect(screen.getByText(/никому не выдан/i)).toBeInTheDocument();
  });
});
