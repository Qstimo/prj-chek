import { EnvironmentKind } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EnvironmentList } from './EnvironmentList';

const environment = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Прод',
  kind: EnvironmentKind.Production,
  domains: ['example.com'],
};

describe('EnvironmentList', () => {
  it('перечисляет окружения списком', () => {
    render(<EnvironmentList environments={[environment]} onEdit={vi.fn()} onDelete={vi.fn()} />);

    // Имя различает список окружений и список доменов внутри карточки.
    expect(screen.getByRole('list', { name: 'Окружения' })).toBeInTheDocument();
    expect(screen.getByText('Прод')).toBeInTheDocument();
  });

  it('передаёт карточке право на реестры', () => {
    // Признак суперадмина проходит насквозь: решение «показывать ли
    // ссылку в реестр» принимает карточка, а знает о праве экран.
    render(
      <EnvironmentList
        environments={[
          {
            ...environment,
            healthCheckPath: null,
            notes: null,
            server: {
              id: '22222222-2222-2222-2222-222222222222',
              name: 'hetzner-fsn-1',
              owner: null,
              host: null,
              ip: null,
              provider: null,
              specs: null,
            },
            platforms: [],
            createdAt: '2026-08-27T10:00:00.000Z',
            updatedAt: '2026-08-27T10:00:00.000Z',
          },
        ]}
        isSuperadmin
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole('link', { name: 'hetzner-fsn-1' })).toBeInTheDocument();
  });

  it('объясняет пустую секцию', () => {
    render(<EnvironmentList environments={[]} onEdit={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText(/окружени/i)).toBeInTheDocument();
  });

  it('в пустой секции зовёт завести окружение того, кто вправе', () => {
    render(
      <EnvironmentList environments={[]} canWrite onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    expect(screen.getByText(/добавьте первое окружение/i)).toBeInTheDocument();
  });
});
