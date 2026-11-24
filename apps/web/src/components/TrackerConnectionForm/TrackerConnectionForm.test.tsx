import { TRACKER_SECRET_MISSING, TrackerKind, type TrackerConnection } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TrackerConnectionForm } from './TrackerConnectionForm';

/** Настроенное подключение: токен задан, адрес вписан. */
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

/** Свежая установка. */
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

function renderForm(connection: TrackerConnection, onSave = vi.fn()) {
  render(<TrackerConnectionForm connection={connection} onSave={onSave} onClose={vi.fn()} />);

  return onSave;
}

describe('TrackerConnectionForm', () => {
  it('поле токена пустое, даже когда токен задан', () => {
    // Заполнять его нечем: сервер токена не отдаёт вовсе.
    renderForm(CONNECTION);

    expect(screen.getByLabelText('Токен')).toHaveValue('');
    expect(screen.getByText(/Токен задан/)).toBeInTheDocument();
  });

  it('пустое поле токена уходит отсутствием поля, а не пустой строкой', async () => {
    // Иначе открыть форму, ничего не трогая, и сохранить значило бы
    // стереть токен.
    const onSave = renderForm(CONNECTION);

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(Object.keys(onSave.mock.calls[0]![0] as object)).not.toContain('secret');
  });

  it('вписанный токен уходит строкой', async () => {
    const onSave = renderForm(CONNECTION);

    await userEvent.type(screen.getByLabelText('Токен'), 'weeek-token');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ secret: 'weeek-token' }));
  });

  it('«Убрать токен» уходит пустым значением и сказано словами', async () => {
    const onSave = renderForm(CONNECTION);

    await userEvent.click(screen.getByRole('button', { name: 'Убрать токен' }));
    expect(screen.getByText(/будет убран при сохранении/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ secret: null }));
  });

  it('негодный адрес отказывает до отправки и теми же словами, что сервер', async () => {
    // Адрес проверяется **той же** чистой функцией контракта, что на
    // сервере: своё похожее правило разошлось бы с ним при первой правке.
    const onSave = renderForm(EMPTY);

    await userEvent.type(screen.getByLabelText('Адрес'), 'http://api.weeek.net/public/v1');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/https/);
  });

  it('пустое пространство уходит пустым значением и работу не блокирует', async () => {
    // Токен сам принадлежит пространству, и порту этот идентификатор не
    // нужен ни в одной из четырёх операций (контракт).
    const onSave = renderForm(EMPTY);

    await userEvent.type(screen.getByLabelText('Адрес'), 'https://api.weeek.net/public/v1');
    await userEvent.type(screen.getByLabelText('Токен'), 'weeek-token');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: null, baseUrl: 'https://api.weeek.net/public/v1' }),
    );
  });

  it('выключатель уезжает решением человека', async () => {
    const onSave = renderForm(CONNECTION);

    await userEvent.click(screen.getByLabelText('Включено'));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ isEnabled: false }));
  });
});
