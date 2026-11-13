import { AccessLevel, ChronicleSource, Section } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as hooks from '@/api/hooks';

import { ChronicleScreen } from './ChronicleScreen';

vi.mock('@/api/hooks');

const ENTRY_A = {
  id: '11111111-1111-1111-1111-111111111111',
  occurredOn: '2026-08-01',
  title: 'Выбрали PostgreSQL',
  content: 'Сравнили с MySQL, решили по расширениям.',
  source: ChronicleSource.Manual,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
};

const ENTRY_B = {
  id: '22222222-2222-2222-2222-222222222222',
  occurredOn: '2026-08-15',
  title: 'Переехали на Hetzner',
  content: 'Прежний провайдер поднял цену вдвое.',
  source: ChronicleSource.Manual,
  createdAt: '2026-08-15T10:00:00.000Z',
  updatedAt: '2026-08-15T10:00:00.000Z',
};

/** Успешный query-результат для мока. */
function query<T>(data: T) {
  return { data, isPending: false, isError: false } as never;
}

/** Бездействующая мутация для мока. */
function mutation() {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, error: null } as never;
}

beforeEach(() => {
  vi.mocked(hooks.useQueryChronicle).mockReturnValue(query([ENTRY_A, ENTRY_B]));
  vi.mocked(hooks.useQuerySections).mockReturnValue(
    query({ [Section.Chronicle]: AccessLevel.Write }),
  );
  vi.mocked(hooks.useQueryIntakeAddress).mockReturnValue(query(null));
  vi.mocked(hooks.useQueryRoadmap).mockReturnValue(query({ versions: [] }));
  vi.mocked(hooks.useMutationCreateChronicleEntry).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationUpdateChronicleEntry).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationDeleteChronicleEntry).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationCreateIntakeAddress).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationRevokeIntakeAddress).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationCreateCheckpoint).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationCreateDocPage).mockReturnValue(mutation());
});

describe('ChronicleScreen', () => {
  it('открывает правку записи с её значениями', async () => {
    render(<ChronicleScreen projectId="p1" isSuperadmin={false} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Править' })[0]!);

    expect(screen.getByLabelText('Заголовок')).toHaveValue('Выбрали PostgreSQL');
  });

  it('пересобирает форму при переходе к правке другой записи', async () => {
    render(<ChronicleScreen projectId="p1" isSuperadmin={false} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Править' })[0]!);
    await userEvent.click(screen.getAllByRole('button', { name: 'Править' })[1]!);

    // Без перемонтирования «Сохранить» отправило бы текст первой записи в
    // PATCH второй, а правки хроники не версионируются.
    expect(screen.getByLabelText('Заголовок')).toHaveValue('Переехали на Hetzner');
    expect(screen.getByLabelText('Содержимое')).toHaveValue(
      'Прежний провайдер поднял цену вдвое.',
    );
    expect(screen.getByLabelText('Дата события')).toHaveValue('2026-08-15');
  });
});
