import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VariableTable } from './VariableTable';

const variable = {
  id: '11111111-1111-1111-1111-111111111111',
  key: 'DATABASE_URL',
  description: 'Строка подключения',
  currentVersion: 2,
  createdAt: '2026-08-27T10:00:00.000Z',
  updatedAt: '2026-08-28T10:00:00.000Z',
};

const noop = {
  onReveal: vi.fn().mockResolvedValue({ value: '', versionNo: 1 }),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onHistory: vi.fn(),
};

describe('VariableTable', () => {
  it('показывает ключ, описание и номер версии — без значения', () => {
    render(<VariableTable variables={[variable]} {...noop} />);

    expect(screen.getByText('DATABASE_URL')).toBeInTheDocument();
    expect(screen.getByText('Строка подключения')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
  });

  it('без права чтения не показывает кнопку раскрытия', () => {
    render(<VariableTable variables={[variable]} {...noop} />);

    expect(screen.queryByRole('button', { name: 'Раскрыть' })).not.toBeInTheDocument();
  });

  it('раскрывает значение по запросу и умеет скрыть обратно', async () => {
    const onReveal = vi
      .fn()
      .mockResolvedValue({ value: 'postgres://secret', versionNo: 2 });
    render(<VariableTable variables={[variable]} {...noop} canReveal onReveal={onReveal} />);

    await userEvent.click(screen.getByRole('button', { name: 'Раскрыть' }));

    expect(onReveal).toHaveBeenCalledWith(variable.id);
    expect(await screen.findByText('postgres://secret')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Скрыть' }));
    expect(screen.queryByText('postgres://secret')).not.toBeInTheDocument();
  });

  it('без права записи не показывает правку и удаление', () => {
    render(<VariableTable variables={[variable]} {...noop} canReveal />);

    expect(screen.queryByRole('button', { name: 'Править' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить' })).not.toBeInTheDocument();
  });

  it('удаление требует подтверждения', async () => {
    const onDelete = vi.fn();
    render(
      <VariableTable variables={[variable]} {...noop} canReveal canWrite onDelete={onDelete} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));
    expect(onDelete).toHaveBeenCalledWith(variable.id);
  });

  it('объясняет пустой список', () => {
    render(<VariableTable variables={[]} {...noop} />);

    expect(screen.getByText(/переменных пока нет/i)).toBeInTheDocument();
  });
});
