import { Section, AccessLevel } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiServer } from '@/api/server';
import Page from './page';
vi.mock('@/api/server', () => ({ apiServer: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); }, redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('../InfrastructureStatusPanel', () => ({ InfrastructureStatusPanel: ({ isSuperadmin }: { isSuperadmin: boolean }) => <div data-testid="dashboard">{isSuperadmin ? 'admin' : 'member'}</div> }));
beforeEach(() => { vi.mocked(apiServer).mockReset(); });
describe('Infrastructure status route', () => {
  it.each([AccessLevel.Metadata, AccessLevel.Read, AccessLevel.Write])('uses the existing Infrastructure grant: %s', async (level) => {
    vi.mocked(apiServer).mockImplementation(async (path) => path === '/auth/me' ? { isSuperadmin: false } : { [Section.Infrastructure]: level });
    render(await Page({ params: Promise.resolve({ id: 'p' }) }));
    expect(screen.getByTestId('dashboard')).toHaveTextContent('member');
    expect(screen.getByRole('link', { name: /Инфраструктура/ })).toHaveAttribute('href', '/projects/p/infrastructure');
    expect(apiServer).toHaveBeenCalledWith('/projects/p/sections');
  });
  it('denies direct navigation without Infrastructure even if another section is visible', async () => {
    vi.mocked(apiServer).mockImplementation(async (path) => path === '/auth/me' ? { isSuperadmin: false } : { [Section.Info]: AccessLevel.Read });
    await expect(Page({ params: Promise.resolve({ id: 'p' }) })).rejects.toThrow('NOT_FOUND');
  });
});
