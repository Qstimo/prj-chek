import { PlatformKind, type Platform, type RoadmapCheckpoint } from '@cairn/shared';
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
  platformIds: [],
};

const withUrl: RoadmapCheckpoint = {
  id: '22222222-2222-4222-8222-222222222222',
  title: 'Перевести биллинг',
  url: 'https://tracker.example.com/TASK-17',
  isDone: false,
  position: 2,
  platformIds: [],
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

  const API: Platform = { id: 'p1', kind: PlatformKind.Server, name: 'API', position: 1 };
  const STORE: Platform = { id: 'p2', kind: PlatformKind.Store, name: 'App Store', position: 2 };

  it('показывает теги платформ у чекпоинта', () => {
    render(
      <CheckpointList
        checkpoints={[{ ...plain, platformIds: ['p1'] }]}
        platforms={[API]}
        canWrite={false}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('API')).toBeInTheDocument();
  });

  it('неизвестный тег пропускает молча', () => {
    // Платформу могли удалить, а закэшированный ответ ещё помнит тег:
    // уборка делает это штатным случаем.
    render(
      <CheckpointList
        checkpoints={[{ ...plain, platformIds: ['нет такой'] }]}
        platforms={[API]}
        canWrite={false}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(plain.title)).toBeInTheDocument();
  });

  it('правит формулировку, ссылку и теги существующего чекпоинта', async () => {
    const onEdit = vi.fn();

    render(
      <CheckpointList
        checkpoints={[plain]}
        platforms={[API, STORE]}
        canWrite
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onEdit={onEdit}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: `Править ${plain.title}` }));
    await userEvent.clear(screen.getByLabelText('Формулировка'));
    await userEvent.type(screen.getByLabelText('Формулировка'), 'Вход по телефону');
    await userEvent.click(screen.getByLabelText('App Store'));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onEdit).toHaveBeenCalledWith(plain.id, {
      title: 'Вход по телефону',
      url: null,
      platformIds: ['p2'],
    });
  });

  it('без права записи править не предлагает', () => {
    render(
      <CheckpointList
        checkpoints={[plain]}
        canWrite={false}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /Править/ })).not.toBeInTheDocument();
  });

  describe('незакрытые чекпоинты выпущенной версии', () => {
    it('помечает незакрытый чекпоинт словами', () => {
      render(
        <CheckpointList
          checkpoints={[plain, { ...withUrl, isDone: true }]}
          canWrite
          markUnfinished
          onToggle={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      // Пометка только у незакрытого: у закрытого она была бы шумом.
      expect(screen.getAllByText('не закрыт')).toHaveLength(1);
    });

    it('без расхождения пометки нет', () => {
      render(
        <CheckpointList checkpoints={[plain]} canWrite onToggle={vi.fn()} onDelete={vi.fn()} />,
      );

      expect(screen.queryByText('не закрыт')).not.toBeInTheDocument();
    });

    it('кнопка переноса называет целевую версию до нажатия', async () => {
      const onCarryOver = vi.fn();
      render(
        <CheckpointList
          checkpoints={[plain]}
          canWrite
          carryOverTargetLabel="v1.3"
          onCarryOver={onCarryOver}
          onToggle={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      const button = screen.getByRole('button', { name: `Перенести ${plain.title} в v1.3` });

      await userEvent.click(button);

      expect(onCarryOver).toHaveBeenCalledWith(plain.id);
    });

    it('без известной цели говорит о следующей версии', () => {
      // Правило «следующая открытая» живёт на сервере: обещать имя,
      // которого не знаем, нельзя.
      render(
        <CheckpointList
          checkpoints={[plain]}
          canWrite
          carryOverTargetLabel={null}
          onCarryOver={vi.fn()}
          onToggle={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      expect(
        screen.getByRole('button', { name: `Перенести ${plain.title} в следующую версию` }),
      ).toBeInTheDocument();
    });

    it('у закрытого чекпоинта переносить нечего', () => {
      render(
        <CheckpointList
          checkpoints={[{ ...plain, isDone: true }]}
          canWrite
          carryOverTargetLabel="v1.3"
          onCarryOver={vi.fn()}
          onToggle={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      expect(screen.queryByRole('button', { name: /Перенести/ })).not.toBeInTheDocument();
    });

    it('без права записи переносить не предлагает', () => {
      render(
        <CheckpointList
          checkpoints={[plain]}
          canWrite={false}
          carryOverTargetLabel="v1.3"
          onCarryOver={vi.fn()}
          onToggle={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      expect(screen.queryByRole('button', { name: /Перенести/ })).not.toBeInTheDocument();
    });

    it('пока перенос идёт, кнопка занята', () => {
      render(
        <CheckpointList
          checkpoints={[plain]}
          canWrite
          carryOverTargetLabel="v1.3"
          isCarryingOver
          onCarryOver={vi.fn()}
          onToggle={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      expect(screen.getByRole('button', { name: /Перенести/ })).toBeDisabled();
    });
  });

  it('из правки можно выйти, не сохраняя', async () => {
    // Иначе открытая по ошибке правка — ловушка: закрыть её нечем.
    const onEdit = vi.fn();

    render(
      <CheckpointList
        checkpoints={[plain]}
        canWrite
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onEdit={onEdit}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: `Править ${plain.title}` }));
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(screen.queryByLabelText('Формулировка')).not.toBeInTheDocument();
    expect(onEdit).not.toHaveBeenCalled();
  });
});
