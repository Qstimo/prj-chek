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
  fallsInWindow: 0,
  windowDays: 30,
};

const OPEN_INCIDENT: Incident = {
  id: '00000000-0000-0000-0000-00000000000a',
  domainId: EMPTY.domainId,
  startedAt: '2026-10-20T14:20:00.000Z',
  resolvedAt: null,
  cause: 'HTTP 500',
  lastCause: 'HTTP 500',
  lastDownAt: '2026-10-20T14:35:00.000Z',
  checks: 2,
};

const PAST_INCIDENT: Incident = {
  ...OPEN_INCIDENT,
  id: '00000000-0000-0000-0000-00000000000b',
  startedAt: '2026-10-19T10:00:00.000Z',
  resolvedAt: '2026-10-19T10:40:00.000Z',
};

/** Закрытое падение со своим ключом: повтор одного ломал бы список React. */
function past(index: number): Incident {
  return { ...PAST_INCIDENT, id: `00000000-0000-0000-0000-00000000001${index}` };
}

describe('инциденты адреса', () => {
  it('открытый инцидент говорит, с каких пор лежит', () => {
    render(<AddressIncidents incidents={{ ...EMPTY, open: OPEN_INCIDENT, fallsInWindow: 1 }} />);

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

  it('закрытые инциденты считаются числом и называют окно', () => {
    // Число без окна читается как утверждение за всё время, а считается
    // последний месяц.
    render(
      <AddressIncidents
        incidents={{ ...EMPTY, past: [past(1), past(2)], fallsInWindow: 2 }}
      />,
    );

    expect(screen.getByText(/падал 2 раза за 30 дней/)).toBeInTheDocument();
  });

  it('один закрытый инцидент склоняется правильно', () => {
    render(<AddressIncidents incidents={{ ...EMPTY, past: [PAST_INCIDENT], fallsInWindow: 1 }} />);

    expect(screen.getByText(/падал 1 раз за 30 дней/)).toBeInTheDocument();
  });

  it('список закрытых раскрывается и называет время падения', async () => {
    // Один день без времени не давал сопоставить падение ни с деплоем,
    // ни с письмом.
    render(<AddressIncidents incidents={{ ...EMPTY, past: [PAST_INCIDENT], fallsInWindow: 1 }} />);
    await userEvent.click(screen.getByText(/падал/));

    expect(screen.getByText(/19\.10\.2026, 13:00 → 13:40/)).toBeInTheDocument();
    expect(screen.getByText(/40 мин/)).toBeInTheDocument();
  });

  it('считает все падения, а не только показанные: список усечён сервером', () => {
    render(<AddressIncidents incidents={{ ...EMPTY, past: [PAST_INCIDENT], fallsInWindow: 57 }} />);

    expect(screen.getByText(/падал 57 раз за 30 дней/)).toBeInTheDocument();
  });

  it('открытое падение входит в счёт', () => {
    // Прежний счёт брал только закрытые, и четвёртое падение подряд
    // читалось как «падал 3 раза» в тот момент, когда адрес лежит.
    render(
      <AddressIncidents
        incidents={{
          ...EMPTY,
          open: OPEN_INCIDENT,
          past: [past(1), past(2), past(3)],
          fallsInWindow: 4,
        }}
      />,
    );

    expect(screen.getByText(/падал 4 раза за 30 дней/)).toBeInTheDocument();
  });

  it('говорит, что список усечён', async () => {
    render(<AddressIncidents incidents={{ ...EMPTY, past: [PAST_INCIDENT], fallsInWindow: 57 }} />);
    await userEvent.click(screen.getByText(/падал/));

    expect(screen.getByText('Показаны последние 1.')).toBeInTheDocument();
  });

  it('на полном списке с открытым падением подвала нет', async () => {
    // Открытое падение входит в счёт, но не в список закрытых: без
    // поправки на него подвал вылезал бы на полной истории.
    render(
      <AddressIncidents
        incidents={{ ...EMPTY, open: OPEN_INCIDENT, past: [PAST_INCIDENT], fallsInWindow: 2 }}
      />,
    );
    await userEvent.click(screen.getByText(/падал/));

    expect(screen.queryByText(/Показаны последние/)).not.toBeInTheDocument();
  });

  it('окно берёт из контракта, а не зашивает', () => {
    render(
      <AddressIncidents
        incidents={{ ...EMPTY, past: [PAST_INCIDENT], fallsInWindow: 1, windowDays: 7 }}
      />,
    );

    expect(screen.getByText(/падал 1 раз за 7 дней/)).toBeInTheDocument();
  });
});
