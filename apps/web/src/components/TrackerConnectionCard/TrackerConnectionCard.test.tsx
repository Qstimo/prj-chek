import {
  ModelProbeOutcome,
  TRACKER_DISABLED,
  TRACKER_SECRET_MISSING,
  TRACKER_SECRET_UNDECRYPTABLE,
  TrackerKind,
  type TrackerConnection,
} from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TrackerConnectionCard } from './TrackerConnectionCard';
import { TrackerProbeOutcome } from './TrackerProbeOutcome';

/** Настроенное и работающее подключение. */
const CONNECTION: TrackerConnection = {
  kind: TrackerKind.Weeek,
  baseUrl: 'https://api.weeek.net/public/v1',
  workspaceId: '42',
  hasSecret: true,
  isEnabled: true,
  isOperational: true,
  blockedBy: null,
  updatedAt: '2026-11-20T10:00:00.000Z',
  updatedByLabel: 'админ@cairn.local',
};

/** Свежая установка: строки подключения нет вовсе. */
const EMPTY: TrackerConnection = {
  ...CONNECTION,
  baseUrl: '',
  workspaceId: null,
  hasSecret: false,
  isEnabled: false,
  isOperational: false,
  blockedBy: TRACKER_SECRET_MISSING,
  updatedAt: null,
  updatedByLabel: null,
};

function renderCard(connection: TrackerConnection, overrides: Record<string, unknown> = {}) {
  return render(
    <TrackerConnectionCard
      connection={connection}
      onEdit={vi.fn()}
      onProbe={vi.fn()}
      onRemove={vi.fn()}
      {...overrides}
    />,
  );
}

describe('TrackerConnectionCard', () => {
  it('ответ без токена не роняет карточку и называет причину', () => {
    // Карточка ненастроенного подключения обязана быть: пустой экран
    // выглядел бы как «настраивать нечего», а человек ищет именно её.
    renderCard(EMPTY);

    expect(screen.getByRole('heading', { name: 'Weeek' })).toBeInTheDocument();
    expect(screen.getByText('Нет токена')).toBeInTheDocument();
  });

  it('у работающего подключения бирка говорит «Работает»', () => {
    renderCard(CONNECTION);

    expect(screen.getByText('Подключено')).toBeInTheDocument();
  });

  it('снятая галочка названа отдельно от отсутствующего токена', () => {
    // Две причины чинятся разным действием: токен берут в Weeek, галочку
    // ставят обратно. «Не настроено» на обе отправило бы искать не то.
    renderCard({ ...CONNECTION, isEnabled: false, isOperational: false, blockedBy: TRACKER_DISABLED });

    expect(screen.getByText('Выключено')).toBeInTheDocument();
  });

  it('о токене сказано «задан», и ни длины, ни хвоста', () => {
    const { container } = renderCard(CONNECTION);

    expect(screen.getByText('Токен задан')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\*|…/);
  });

  it('подменённый ключ шифрования зовёт вписать токен заново', () => {
    renderCard({ ...CONNECTION, isOperational: false, blockedBy: TRACKER_SECRET_UNDECRYPTABLE });

    expect(screen.getByText(/CAIRN_ENCRYPTION_KEY/)).toBeInTheDocument();
  });

  it('у неработающего подключения проверять связь нечем', () => {
    // Кнопка выключена, а не отвечает отказом: без токена в сеть не идёт
    // ни один байт, и выяснять это нажатием незачем.
    renderCard(EMPTY);

    expect(screen.getByRole('button', { name: 'Проверить связь' })).toBeDisabled();
  });

  it('проверка связи запускается только нажатием', async () => {
    const onProbe = vi.fn();

    renderCard(CONNECTION, { onProbe });

    expect(onProbe).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Проверить связь' }));
    expect(onProbe).toHaveBeenCalledTimes(1);
  });

  it('снятие подключения предлагается только когда оно есть', () => {
    renderCard(EMPTY);

    expect(screen.queryByRole('button', { name: /Убрать подключение/ })).toBeNull();

    renderCard(CONNECTION);

    expect(screen.getByRole('button', { name: /Убрать подключение/ })).toBeInTheDocument();
  });
});

describe('TrackerProbeOutcome', () => {
  it('принятый токен назван успехом вместе с узлом и временем', () => {
    render(
      <TrackerProbeOutcome
        result={{
          outcome: ModelProbeOutcome.Ok,
          status: 200,
          host: 'api.weeek.net',
          durationMs: 1200,
        }}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/Связь есть/);
    expect(screen.getByRole('status')).toHaveTextContent(/api\.weeek\.net/);
    expect(screen.getByRole('status')).toHaveTextContent(/1,2 с/);
  });

  it('отказ по токену говорит, где его менять, и не говорит про модель', () => {
    // Исходы те же шесть, что у узлов модели, а слова — свои: имени
    // модели у трекера нет, и фраза про неё отправила бы править то,
    // чего в настройке не существует.
    render(
      <TrackerProbeOutcome
        result={{
          outcome: ModelProbeOutcome.Unauthorized,
          status: 401,
          host: 'api.weeek.net',
          durationMs: 80,
        }}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/Токен не принят/);
    expect(screen.getByRole('status')).toHaveTextContent(/ответ 401/);
    expect(screen.getByRole('status').textContent).not.toMatch(/модел/i);
  });

  it('у исхода без кода ответа кода и не показывается', () => {
    // Обрыв связи кода не имеет, и «ответ null» соврал бы о том, что
    // ответ был.
    render(
      <TrackerProbeOutcome
        result={{
          outcome: ModelProbeOutcome.Unavailable,
          status: null,
          host: 'api.weeek.net',
          durationMs: 30_000,
        }}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/не ответил/);
    expect(screen.getByRole('status').textContent).not.toMatch(/ответ /);
  });
});
