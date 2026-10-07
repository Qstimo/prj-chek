import { PlatformKind, ProjectLifecycle } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as hooks from '@/api/hooks';
import type { ProjectFormValues } from '@/components/ProjectForm';

import { EditProjectPanel } from './EditProjectPanel';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/api/hooks');

const INITIAL: ProjectFormValues = {
  name: 'Касса',
  purpose: null,
  stack: null,
  repoUrl: null,
  notes: null,
  lifecycle: ProjectLifecycle.Active,
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
  push.mockClear();
  refresh.mockClear();
  // Все четыре хука компонента: автомок вернул бы undefined, а хуки
  // вызываются до раннего возврата по правам.
  vi.mocked(hooks.useMutationUpdateProject).mockReturnValue(mutation());
  vi.mocked(hooks.useQueryPlatforms).mockReturnValue(query([]));
  vi.mocked(hooks.useMutationCreatePlatform).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationDeletePlatform).mockReturnValue(mutation());
});

describe('EditProjectPanel', () => {
  it('сохраняет паспорт и закрывает панель', async () => {
    const mutate = vi.fn((_input, options) => options?.onSuccess?.());
    vi.mocked(hooks.useMutationUpdateProject).mockReturnValue({
      mutate,
      isPending: false,
      error: null,
    } as never);

    render(<EditProjectPanel projectId="p1" initial={INITIAL} canWrite />);

    await userEvent.click(screen.getByRole('button', { name: 'Править' }));
    await userEvent.clear(screen.getByLabelText('Название'));
    await userEvent.type(screen.getByLabelText('Название'), 'Касса+');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(mutate.mock.calls[0]?.[0]).toMatchObject({ name: 'Касса+' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it('правит платформы сразу, без отправки формы', async () => {
    // Чип действует мутацией, как галочка чекпоинта: отправлять паспорт
    // целиком ради одной платформы незачем, и чужую правку это не затрёт.
    const create = vi.fn();
    vi.mocked(hooks.useMutationCreatePlatform).mockReturnValue({
      mutate: create,
      isPending: false,
      error: null,
    } as never);

    render(<EditProjectPanel projectId="p1" initial={INITIAL} canWrite />);

    await userEvent.click(screen.getByRole('button', { name: 'Править' }));
    await userEvent.click(screen.getByRole('button', { name: '+ Веб' }));

    expect(create).toHaveBeenCalledWith({ kind: PlatformKind.Server, name: 'Веб' });
  });

  it('снимает платформу мутацией по её идентификатору', async () => {
    vi.mocked(hooks.useQueryPlatforms).mockReturnValue(
      query([{ id: 'p9', kind: PlatformKind.Store, name: 'RuStore', position: 1 }]),
    );
    const remove = vi.fn();
    vi.mocked(hooks.useMutationDeletePlatform).mockReturnValue({
      mutate: remove,
      isPending: false,
      error: null,
    } as never);

    render(<EditProjectPanel projectId="p1" initial={INITIAL} canWrite />);

    await userEvent.click(screen.getByRole('button', { name: 'Править' }));
    await userEvent.click(screen.getByRole('button', { name: 'Убрать RuStore' }));

    expect(remove).toHaveBeenCalledWith('p9');
  });

  it('не показывает кнопку правки без уровня записи', () => {
    render(<EditProjectPanel projectId="p1" initial={INITIAL} canWrite={false} />);

    expect(screen.queryByRole('button', { name: 'Править' })).not.toBeInTheDocument();
  });
});
