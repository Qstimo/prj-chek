import { ChronicleSource } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChronicleList } from './ChronicleList';

const entry = {
  id: '11111111-1111-1111-1111-111111111111',
  occurredOn: '2026-08-27',
  title: 'Встреча по релизу',
  source: ChronicleSource.Manual,
};

describe('ChronicleList', () => {
  it('перечисляет записи списком', () => {
    render(<ChronicleList entries={[entry]} onEdit={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByRole('list', { name: 'Хроника' })).toBeInTheDocument();
    expect(screen.getByText('Встреча по релизу')).toBeInTheDocument();
  });

  it('объясняет пустую ленту читателю', () => {
    render(<ChronicleList entries={[]} onEdit={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText(/записей пока нет/i)).toBeInTheDocument();
  });

  it('в пустой ленте зовёт пишущего добавить запись', () => {
    render(<ChronicleList entries={[]} canWrite onEdit={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText(/добавьте первую запись/i)).toBeInTheDocument();
  });
});
