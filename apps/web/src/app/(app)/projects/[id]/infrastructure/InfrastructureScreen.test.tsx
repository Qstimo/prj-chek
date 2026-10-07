import { AccessLevel, EnvironmentKind, PlatformKind, Section } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as hooks from '@/api/hooks';

import { InfrastructureScreen } from './InfrastructureScreen';

vi.mock('@/api/hooks');

const ENVIRONMENT = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Прод',
  kind: EnvironmentKind.Production,
  domains: ['example.com'],
  healthCheckPath: null,
  notes: null,
  server: null,
  platforms: [],
  createdAt: '2026-08-27T10:00:00.000Z',
  updatedAt: '2026-08-27T10:00:00.000Z',
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
  vi.mocked(hooks.useQueryEnvironments).mockReturnValue(query([ENVIRONMENT]));
  // Обе секции: «Инфраструктура» открывает экран, «Инфо» — галочки
  // платформ, и без неё они не появятся.
  vi.mocked(hooks.useQuerySections).mockReturnValue(
    query({ [Section.Infrastructure]: AccessLevel.Write, [Section.Info]: AccessLevel.Write }),
  );
  vi.mocked(hooks.useQueryServers).mockReturnValue(query([]));
  vi.mocked(hooks.useQueryDomains).mockReturnValue(query([]));
  vi.mocked(hooks.useQueryPlatforms).mockReturnValue(
    query([{ id: 'p1', kind: PlatformKind.Server, name: 'API', position: 1 }]),
  );
  vi.mocked(hooks.useMutationCreateEnvironment).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationUpdateEnvironment).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationDeleteEnvironment).mockReturnValue(mutation());
});

describe('InfrastructureScreen', () => {
  it('открывает форму нового окружения в панели', async () => {
    render(<InfrastructureScreen projectId="p1" isSuperadmin={false} />);

    await userEvent.click(screen.getByRole('button', { name: 'Добавить окружение' }));

    expect(screen.getByRole('dialog', { name: 'Новое окружение' })).toBeInTheDocument();
    expect(screen.getByLabelText('API')).toBeInTheDocument();
  });

  it('открывает правку окружения в панели с его значениями', async () => {
    render(<InfrastructureScreen projectId="p1" isSuperadmin={false} />);

    await userEvent.click(screen.getByRole('button', { name: 'Править' }));

    expect(screen.getByRole('dialog', { name: 'Правка окружения' })).toBeInTheDocument();
    expect(screen.getByLabelText('Название')).toHaveValue('Прод');
  });

  it('не показывает кнопку добавления без уровня записи', () => {
    vi.mocked(hooks.useQuerySections).mockReturnValue(
      query({ [Section.Infrastructure]: AccessLevel.Read }),
    );

    render(<InfrastructureScreen projectId="p1" isSuperadmin={false} />);

    expect(screen.queryByRole('button', { name: 'Добавить окружение' })).not.toBeInTheDocument();
  });
});
