import { ProjectLifecycle } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as hooks from '@/api/hooks';

import { SummariesScreen } from './SummariesScreen';

vi.mock('@/api/hooks');

const PROJECT = {
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'cairn',
  name: 'CAIRN',
  lifecycle: ProjectLifecycle.Active,
};

const ITEM = {
  id: '22222222-2222-2222-2222-222222222222',
  projectId: PROJECT.id,
  projectName: 'CAIRN',
  occurredOn: '2026-11-16',
  title: 'Созвон по релизу',
  taskCount: 0,
  isReleased: false,
  releasedVersionLabel: null,
  createdAt: '2026-11-16T10:00:00.000Z',
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
  vi.mocked(hooks.useQuerySummaries).mockReturnValue(query([ITEM]));
  vi.mocked(hooks.useQuerySummaryTargets).mockReturnValue(query([PROJECT]));
  vi.mocked(hooks.useMutationCreateSummary).mockReturnValue(mutation());
});

describe('экран истории саммари', () => {
  it('показывает историю', () => {
    render(<SummariesScreen />);

    expect(screen.getByText('Созвон по релизу')).toBeInTheDocument();
  });

  it('«Новое саммари» открывает панель с формой', async () => {
    render(<SummariesScreen />);

    await userEvent.click(screen.getByRole('button', { name: 'Новое саммари' }));

    expect(screen.getByRole('dialog', { name: 'Новое саммари' })).toBeInTheDocument();
    expect(screen.getByLabelText('Проект')).toBeInTheDocument();
  });

  it('без целей кнопка создания объясняет, почему её нет смысла нажимать', async () => {
    // Вкладка видна всем: прятать её значило бы считать выдачи при
    // отрисовке навигации, а пустой экран ничего не раскрывает.
    vi.mocked(hooks.useQuerySummaryTargets).mockReturnValue(query([]));

    render(<SummariesScreen />);

    await userEvent.click(screen.getByRole('button', { name: 'Новое саммари' }));

    expect(screen.getByText(/писать хронику/)).toBeInTheDocument();
  });

  it('отказ загрузки истории не выглядит пустой историей', () => {
    vi.mocked(hooks.useQuerySummaries).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    } as never);

    render(<SummariesScreen />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
