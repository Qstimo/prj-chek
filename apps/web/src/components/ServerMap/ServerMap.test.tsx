import {
  EnvironmentKind,
  ProjectLifecycle,
  StatusIndicator,
  StatusWarningKind,
  type ServerMap as ServerMapData,
} from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ServerMap } from './ServerMap';

const SERVER_ID = '11111111-1111-1111-1111-111111111111';
const PROJECT_ID = '22222222-2222-2222-2222-222222222222';

const MAP: ServerMapData = {
  servers: [
    {
      id: SERVER_ID,
      name: 'hetzner-fsn-1',
      owner: 'ООО Ромашка',
      indicator: StatusIndicator.Warning,
      paidUntil: '2027-01-12',
      warnings: [
        {
          kind: StatusWarningKind.ServerExpiring,
          subject: 'hetzner-fsn-1',
          detail: 'оплачен до 2027-01-12',
        },
      ],
    },
  ],
  projects: [
    {
      id: PROJECT_ID,
      name: 'Витрина',
      lifecycle: ProjectLifecycle.Active,
      indicator: StatusIndicator.Ok,
    },
  ],
  edges: [
    {
      serverId: SERVER_ID,
      projectId: PROJECT_ID,
      environments: [
        { id: '33333333-3333-3333-3333-333333333333', name: 'Прод', kind: EnvironmentKind.Production },
      ],
    },
  ],
};

describe('карта размещения', () => {
  it('рисует узлы кнопками с доступными именами', () => {
    render(<ServerMap map={MAP} />);

    expect(
      screen.getByRole('button', { name: 'Сервер hetzner-fsn-1, предупреждение' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Проект Витрина, в порядке' })).toBeInTheDocument();
  });

  it('выделение узла подсвечивает его рёбра и открывает панель', async () => {
    render(<ServerMap map={MAP} />);

    await userEvent.click(screen.getByRole('button', { name: /Сервер hetzner-fsn-1/ }));

    expect(screen.getByRole('complementary')).toHaveTextContent('hetzner-fsn-1');
    expect(screen.getByTestId(`edge-${SERVER_ID}-${PROJECT_ID}`)).toHaveAttribute(
      'data-active',
      'true',
    );
  });

  it('панель показывает владельца, срок оплаты и что на машине', async () => {
    render(<ServerMap map={MAP} />);

    await userEvent.click(screen.getByRole('button', { name: /Сервер hetzner-fsn-1/ }));

    const panel = screen.getByRole('complementary');

    expect(panel).toHaveTextContent('ООО Ромашка');
    expect(panel).toHaveTextContent('Оплачен до 12.01.2027');
    expect(panel).toHaveTextContent('Витрина');
    expect(panel).toHaveTextContent('Прод');
  });

  it('Esc снимает выделение', async () => {
    render(<ServerMap map={MAP} />);

    await userEvent.click(screen.getByRole('button', { name: /Сервер hetzner-fsn-1/ }));
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('пустая карта объясняет, почему она пуста', () => {
    render(<ServerMap map={{ servers: [], projects: [], edges: [] }} />);

    expect(screen.getByText('Ни одно окружение не привязано к серверу.')).toBeInTheDocument();
  });

  it('масштаб меняется кнопками', async () => {
    render(<ServerMap map={MAP} />);

    const canvas = screen.getByTestId('map-canvas');
    const before = canvas.style.transform;

    await userEvent.click(screen.getByRole('button', { name: 'Приблизить' }));

    expect(canvas.style.transform).not.toBe(before);
  });
});
