import type { AddressIncidents as AddressIncidentsData, Incident } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AddressIncidents } from './AddressIncidents';

const EMPTY: AddressIncidentsData = {
  domainId: '00000000-0000-0000-0000-000000000002',
  name: 'project.ru',
  open: null,
  past: [],
};

const OPEN_INCIDENT: Incident = {
  id: '00000000-0000-0000-0000-00000000000a',
  domainId: EMPTY.domainId,
  startedAt: '2026-10-20T14:20:00.000Z',
  resolvedAt: null,
  cause: 'HTTP 500',
};

const PAST_INCIDENT: Incident = {
  ...OPEN_INCIDENT,
  id: '00000000-0000-0000-0000-00000000000b',
  startedAt: '2026-10-19T10:00:00.000Z',
  resolvedAt: '2026-10-19T10:40:00.000Z',
};

describe('инциденты адреса', () => {
  it('открытый инцидент говорит, с каких пор лежит', () => {
    render(<AddressIncidents incidents={{ ...EMPTY, open: OPEN_INCIDENT }} />);

    expect(screen.getByText(/не отвечает с/)).toBeInTheDocument();
  });

  it('без инцидентов не рисует ничего', () => {
    const { container } = render(<AddressIncidents incidents={EMPTY} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('инцидентов нет вовсе — тоже ничего', () => {
    const { container } = render(<AddressIncidents />);

    expect(container).toBeEmptyDOMElement();
  });

  it('закрытые инциденты считаются числом', () => {
    render(<AddressIncidents incidents={{ ...EMPTY, past: [PAST_INCIDENT, PAST_INCIDENT] }} />);

    expect(screen.getByText(/падал 2 раза/)).toBeInTheDocument();
  });

  it('один закрытый инцидент склоняется правильно', () => {
    render(<AddressIncidents incidents={{ ...EMPTY, past: [PAST_INCIDENT] }} />);

    expect(screen.getByText(/падал 1 раз/)).toBeInTheDocument();
  });

  it('список закрытых раскрывается', async () => {
    render(<AddressIncidents incidents={{ ...EMPTY, past: [PAST_INCIDENT] }} />);
    await userEvent.click(screen.getByText(/падал/));

    expect(screen.getByText(/40 минут/)).toBeInTheDocument();
  });
});
