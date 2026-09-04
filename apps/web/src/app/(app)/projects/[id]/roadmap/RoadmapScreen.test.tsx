import { AccessLevel, RoadmapVersionState, Section } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as hooks from '@/api/hooks';

import { RoadmapScreen } from './RoadmapScreen';

vi.mock('@/api/hooks');

const roadmap = {
  stage: { current: 1, total: 2 },
  versions: [
    {
      id: '1',
      label: 'v1.0',
      state: RoadmapVersionState.InProgress,
      plannedDate: null,
      releasedDate: null,
      position: 1,
      progress: { done: 0, total: 1 },
      checkpoints: [{ id: 'c1', title: 'Оплата', isDone: false, position: 1 }],
    },
    {
      id: '2',
      label: 'v2.0',
      state: RoadmapVersionState.Planned,
      plannedDate: null,
      releasedDate: null,
      position: 2,
      progress: { done: 0, total: 0 },
      checkpoints: [],
    },
  ],
};

/** Успешный query-результат для мока. */
function query<T>(data: T) {
  return { data, isPending: false, isError: false } as never;
}

/** Бездействующая мутация для мока. */
function mutation() {
  return { mutate: vi.fn(), isPending: false, error: null } as never;
}

beforeEach(() => {
  vi.mocked(hooks.useQueryRoadmap).mockReturnValue(query(roadmap));
  vi.mocked(hooks.useQuerySections).mockReturnValue(
    query({ [Section.Roadmap]: AccessLevel.Write }),
  );
  vi.mocked(hooks.useQueryPublicLink).mockReturnValue(query(null));
  vi.mocked(hooks.useMutationCreateVersion).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationUpdateVersion).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationDeleteVersion).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationCreateCheckpoint).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationUpdateCheckpoint).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationDeleteCheckpoint).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationPublishRoadmap).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationUnpublishRoadmap).mockReturnValue(mutation());
});

describe('RoadmapScreen', () => {
  it('клик по версии открывает панель с её содержимым', async () => {
    render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    await userEvent.click(screen.getByRole('button', { name: 'Версия v1.0' }));

    expect(screen.getByRole('dialog', { name: 'v1.0' })).toBeInTheDocument();
    expect(screen.getByLabelText('Оплата')).toBeInTheDocument();
  });

  it('после закрытия панели версии открывается панель создания', async () => {
    render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    await userEvent.click(screen.getByRole('button', { name: 'Версия v1.0' }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить версию' }));

    expect(screen.getByRole('dialog', { name: 'Новая версия' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'v1.0' })).not.toBeInTheDocument();
  });

  it('отправка формы создания вызывает мутацию и закрывает панель', async () => {
    // Мок сразу зовёт onSuccess — как успешный ответ сервера.
    const mutate = vi.fn((_input: unknown, options?: { onSuccess?: () => void }) =>
      options?.onSuccess?.(),
    );
    vi.mocked(hooks.useMutationCreateVersion).mockReturnValue(
      { mutate, isPending: false, error: null } as never,
    );
    render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    await userEvent.click(screen.getByRole('button', { name: 'Добавить версию' }));
    await userEvent.type(screen.getByLabelText('Обозначение'), 'v3.0');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'v3.0' }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(screen.queryByRole('dialog', { name: 'Новая версия' })).not.toBeInTheDocument();
  });

  it('панель закрывается, когда версия исчезла из данных', async () => {
    const { rerender } = render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    await userEvent.click(screen.getByRole('button', { name: 'Версия v1.0' }));
    expect(screen.getByRole('dialog', { name: 'v1.0' })).toBeInTheDocument();

    vi.mocked(hooks.useQueryRoadmap).mockReturnValue(
      query({ ...roadmap, versions: [roadmap.versions[1]!] }),
    );
    rerender(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('без права записи нет кнопки добавления', () => {
    vi.mocked(hooks.useQuerySections).mockReturnValue(
      query({ [Section.Roadmap]: AccessLevel.Read }),
    );
    render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    expect(screen.queryByRole('button', { name: 'Добавить версию' })).not.toBeInTheDocument();
  });
});
