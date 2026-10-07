import { PlatformKind } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as hooks from '@/api/hooks';

import { CreateProjectPanel } from './CreateProjectPanel';

const push = vi.fn();
const refresh = vi.fn();

// Глобальный мок в vitest.setup.ts падать не даёт, но и наблюдать push
// через него нельзя: он отдаёт новые функции на каждый вызов. Локальная
// фабрика заменяет глобальную целиком, поэтому повторяет весь набор.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/api/hooks');

/** Бездействующая мутация для мока. */
function mutation() {
  return { mutate: vi.fn(), isPending: false, error: null } as never;
}

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
  vi.mocked(hooks.useMutationCreateProject).mockReturnValue(mutation());
});

describe('CreateProjectPanel', () => {
  it('открывает панель создания и закрывает по Esc', async () => {
    render(<CreateProjectPanel />);

    await userEvent.click(screen.getByRole('button', { name: 'Создать проект' }));

    expect(screen.getByRole('dialog', { name: 'Новый проект' })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('отправляет платформы вместе с новым проектом и уходит на его карточку', async () => {
    const mutate = vi.fn((_input, options) => options?.onSuccess?.({ id: 'created-id' }));
    vi.mocked(hooks.useMutationCreateProject).mockReturnValue({
      mutate,
      isPending: false,
      error: null,
    } as never);

    render(<CreateProjectPanel />);

    await userEvent.click(screen.getByRole('button', { name: 'Создать проект' }));
    await userEvent.type(screen.getByLabelText('Название'), 'Касса');
    await userEvent.click(screen.getByRole('button', { name: '+ API' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(mutate.mock.calls[0]?.[0]).toMatchObject({
      name: 'Касса',
      platforms: [{ kind: PlatformKind.Server, name: 'API' }],
    });
    expect(push).toHaveBeenCalledWith('/projects/created-id');
    expect(refresh).toHaveBeenCalled();
  });

  it('снимает платформу из набора до отправки', async () => {
    const mutate = vi.fn();
    vi.mocked(hooks.useMutationCreateProject).mockReturnValue({
      mutate,
      isPending: false,
      error: null,
    } as never);

    render(<CreateProjectPanel />);

    await userEvent.click(screen.getByRole('button', { name: 'Создать проект' }));
    await userEvent.type(screen.getByLabelText('Название'), 'Касса');
    await userEvent.click(screen.getByRole('button', { name: '+ API' }));
    await userEvent.click(screen.getByRole('button', { name: 'Убрать API' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(mutate.mock.calls[0]?.[0]).not.toHaveProperty('platforms');
  });
});
