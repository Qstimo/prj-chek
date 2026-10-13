import { AccessLevel, Section } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { UserGrantsMatrix } from './UserGrantsMatrix';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ID = '22222222-2222-2222-2222-222222222222';

const rows = [
  { projectId: PROJECT_ID, projectName: 'CAIRN', levels: { [Section.Info]: AccessLevel.Read } },
];

const handlers = { onChange: vi.fn(), onAddProject: vi.fn() };

describe('UserGrantsMatrix', () => {
  it('показывает строку на проект и шесть секций', () => {
    render(<UserGrantsMatrix rows={rows} candidates={[]} {...handlers} />);

    expect(screen.getByText('CAIRN')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(7);
  });

  it('показывает текущий уровень', () => {
    render(<UserGrantsMatrix rows={rows} candidates={[]} {...handlers} />);

    expect(screen.getByLabelText('CAIRN, Инфо')).toHaveValue(AccessLevel.Read);
  });

  it('показывает отсутствие доступа пустым значением', () => {
    render(<UserGrantsMatrix rows={rows} candidates={[]} {...handlers} />);

    expect(screen.getByLabelText('CAIRN, Документация')).toHaveValue('');
  });

  it('передаёт изменение с проектом', async () => {
    const onChange = vi.fn();
    render(<UserGrantsMatrix rows={rows} candidates={[]} {...handlers} onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText('CAIRN, Инфо'), AccessLevel.Write);

    expect(onChange).toHaveBeenCalledWith(PROJECT_ID, {
      section: Section.Info,
      level: AccessLevel.Write,
    });
  });

  it('передаёт отзыв пустым уровнем', async () => {
    const onChange = vi.fn();
    render(<UserGrantsMatrix rows={rows} candidates={[]} {...handlers} onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText('CAIRN, Инфо'), '');

    expect(onChange).toHaveBeenCalledWith(PROJECT_ID, { section: Section.Info, level: null });
  });

  it('объясняет пустую матрицу', () => {
    render(<UserGrantsMatrix rows={[]} candidates={[]} {...handlers} />);

    expect(screen.getByText(/нет доступа ни к одному проекту/i)).toBeInTheDocument();
  });

  it('добавляет проект из остальных', async () => {
    const onAddProject = vi.fn();
    render(
      <UserGrantsMatrix
        rows={[]}
        candidates={[{ id: OTHER_ID, name: 'Shop' }]}
        {...handlers}
        onAddProject={onAddProject}
      />,
    );

    await userEvent.selectOptions(screen.getByLabelText('Добавить проект'), OTHER_ID);
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(onAddProject).toHaveBeenCalledWith(OTHER_ID);
  });

  it('не предлагает добавление, когда добавлять нечего', () => {
    render(<UserGrantsMatrix rows={rows} candidates={[]} {...handlers} />);

    expect(screen.queryByLabelText('Добавить проект')).not.toBeInTheDocument();
  });
});
