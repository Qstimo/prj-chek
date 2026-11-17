import { ProjectLifecycle } from '@cairn/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { ProjectListContainer } from './ProjectListContainer';

// Список читает выбранные теги из адреса: без заглушки навигации
// `useSearchParams` упал бы вне роутера Next.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => vi.unstubAllGlobals());

it('при возврате на сводку обновляет домен даже с устаревшими серверными пропсами', async () => {
  const project = {
    id: '11111111-1111-1111-1111-111111111111',
    slug: 'project', name: 'Проект', lifecycle: ProjectLifecycle.Active,
    updatedAt: null, platforms: [], tags: [], productionDomain: null, productionServerName: null,
  };
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  client.setQueryData(['projects'], [project]);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => [{ ...project, productionDomain: 'new.example.com' }],
  }));

  render(
    <QueryClientProvider client={client}>
      <ProjectListContainer projects={[project]} />
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('link', { name: 'new.example.com' })).toHaveAttribute(
    'href', 'https://new.example.com',
  );
});
