import type { AddressIncidentHistory } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as hooks from '@/api/hooks';
import { IncidentCharts } from './IncidentCharts';
vi.mock('@/api/hooks');
const history: AddressIncidentHistory = {
  domainId: 'a', name: 'example.com', window: { days: 1, from: '2026-11-01T00:00:00Z', to: '2026-11-02T00:00:00Z' },
  summary: { falls: 0, downSeconds: 0, unobservedSeconds: 0, uptime: 1 }, open: null, incidents: [], offset: 0, limit: 200, nextOffset: null,
};
const fetchNextPage = vi.fn();
function query(overrides = {}) {
  return { data: history, isPending: false, isFetching: false, isError: false, hasNextPage: false, fetchNextPage, refetch: vi.fn(), ...overrides } as never;
}
beforeEach(() => { fetchNextPage.mockClear(); vi.mocked(hooks.useQueryAddressIncidents).mockReturnValue(query()); });
function renderChart() { return render(<IncidentCharts projectId="p" domainId="a" windowDays={7} />); }
describe('incident charts', () => {
  it('requests full paginated history and automatically continues to the last page', () => {
    vi.mocked(hooks.useQueryAddressIncidents).mockReturnValue(query({ hasNextPage: true, data: { ...history, nextOffset: 200, summary: { ...history.summary, falls: 201 } } }));
    renderChart();
    expect(hooks.useQueryAddressIncidents).toHaveBeenCalledWith('p', 'a', { windowDays: 7, limit: 200 });
    expect(fetchNextPage).toHaveBeenCalledWith({ cancelRefetch: false });
    expect(screen.getByText(/История неполная/)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
  it('does not claim uptime from an empty incident record', () => {
    renderChart();
    expect(screen.getByText(/инцидентов не зарегистрировано/)).toBeInTheDocument();
    expect(screen.getByText(/не подтверждает измеренный аптайм/)).toBeInTheDocument();
    expect(screen.queryByText(/100%/)).not.toBeInTheDocument();
    expect(screen.getByRole('img')).toBeInTheDocument();
  });
  it.each(['pending', 'error'])('distinguishes %s from no incidents', (state) => {
    vi.mocked(hooks.useQueryAddressIncidents).mockReturnValue(query({ data: undefined, isPending: state === 'pending', isFetching: state === 'pending', isError: state === 'error' }));
    renderChart();
    expect(screen.queryByText(/инцидентов не зарегистрировано/)).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole(state === 'pending' ? 'status' : 'alert')).toBeInTheDocument();
  });
  it('preserves a previously complete chart with a stale-data warning after a failed refresh', () => {
    vi.mocked(hooks.useQueryAddressIncidents).mockReturnValue(query({ isError: true }));
    renderChart();
    expect(screen.getByRole('alert')).toHaveTextContent(/ранее загруженные данные/);
    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });
  it('does not present a truncated dataset as a finished chart even if nextOffset is missing', () => {
    vi.mocked(hooks.useQueryAddressIncidents).mockReturnValue(query({ data: { ...history, summary: { ...history.summary, falls: 20 } } }));
    renderChart();
    expect(screen.getByText(/История неполная/)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
