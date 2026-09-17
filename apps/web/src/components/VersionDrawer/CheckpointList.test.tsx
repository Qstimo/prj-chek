import type { RoadmapCheckpoint } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CheckpointList } from './CheckpointList';

const plain: RoadmapCheckpoint = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Без ссылки',
  url: null,
  isDone: false,
  position: 1,
};

const withUrl: RoadmapCheckpoint = {
  id: '22222222-2222-4222-8222-222222222222',
  title: 'Перевести биллинг',
  url: 'https://tracker.example.com/TASK-17',
  isDone: false,
  position: 2,
};

describe('CheckpointList', () => {
  it('ведёт на задачу, когда ссылка задана', () => {
    render(
      <CheckpointList checkpoints={[withUrl]} canWrite onToggle={vi.fn()} onDelete={vi.fn()} />,
    );

    const link = screen.getByRole('link', { name: withUrl.title });

    expect(link).toHaveAttribute('href', withUrl.url);
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('без ссылки оставляет формулировку текстом', () => {
    render(<CheckpointList checkpoints={[plain]} canWrite onToggle={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('клик по задаче не переключает галочку', async () => {
    const onToggle = vi.fn();
    render(
      <CheckpointList checkpoints={[withUrl]} canWrite onToggle={onToggle} onDelete={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole('link', { name: withUrl.title }));

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('галочка переключается сама', async () => {
    const onToggle = vi.fn();
    render(
      <CheckpointList checkpoints={[withUrl]} canWrite onToggle={onToggle} onDelete={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole('checkbox'));

    expect(onToggle).toHaveBeenCalledWith(withUrl.id, true);
  });

  it('без права записи галочка недоступна', () => {
    render(
      <CheckpointList
        checkpoints={[plain]}
        canWrite={false}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  it('пустой список говорит об этом словами', () => {
    render(<CheckpointList checkpoints={[]} canWrite onToggle={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText('Чекпоинтов пока нет.')).toBeInTheDocument();
  });
});
