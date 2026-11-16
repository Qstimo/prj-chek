import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as hooks from '@/api/hooks';
import { InfrastructureStatusEntry } from './InfrastructureStatusEntry';
vi.mock('@/api/hooks');
describe('compact status entry', () => {
  it('links to the nested Infrastructure screen and preserves running feedback', () => {
    vi.mocked(hooks.useQueryProjectStatus).mockReturnValue({ data: { indicator: 'ok', checkRunning: true }, isPending: false, isError: false } as never);
    render(<InfrastructureStatusEntry projectId="p" />);
    expect(screen.getByRole('link', { name: /Статус и история/ })).toHaveAttribute('href', '/projects/p/infrastructure/status');
    expect(screen.getByText('Проверки выполняются…')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
  it('does not reveal the status link without Infrastructure access', () => {
    vi.mocked(hooks.useQueryProjectStatus).mockReturnValue({ data: null, isPending: false, isError: false } as never);
    const { container } = render(<InfrastructureStatusEntry projectId="p" />);
    expect(container).toBeEmptyDOMElement();
  });
});
