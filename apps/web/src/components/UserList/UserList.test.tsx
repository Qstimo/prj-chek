import { InvitationKind, SubjectKind } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserList } from './UserList';

const user = {
  id: '11111111-1111-1111-1111-111111111111',
  subjectId: '22222222-2222-2222-2222-222222222222',
  subjectKind: SubjectKind.User,
  email: 'user@cairn.local',
  isSuperadmin: false,
  isTotpEnabled: false,
  hasPassword: true,
  isRevoked: false,
  lastLinkKind: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const handlers = { onRevoke: vi.fn(), onRestore: vi.fn(), onResetPassword: vi.fn(), onResetTotp: vi.fn() };

describe('UserList', () => {
  beforeEach(() => {
    // Обработчики общие на весь файл: без сброса вызовы копились бы между тестами.
    vi.clearAllMocks();
  });

  it('показывает адрес пользователя', () => {
    render(<UserList users={[user]} {...handlers} />);

    expect(screen.getByText('user@cairn.local')).toBeInTheDocument();
  });

  it('отмечает суперадмина', () => {
    render(<UserList users={[{ ...user, isSuperadmin: true }]} {...handlers} />);

    expect(screen.getByText('Суперадмин')).toBeInTheDocument();
  });

  it('показывает приглашённого, ещё не задавшего пароль', () => {
    render(
      <UserList
        users={[{ ...user, hasPassword: false, lastLinkKind: InvitationKind.Invitation }]}
        {...handlers}
      />,
    );

    expect(screen.getByText('Приглашён')).toBeInTheDocument();
  });

  it('отличает сброшенный пароль от приглашения', () => {
    // Оба состояния — «нет действующего пароля», различает их вид ссылки (спека 4.2).
    render(
      <UserList
        users={[{ ...user, hasPassword: false, lastLinkKind: InvitationKind.PasswordReset }]}
        {...handlers}
      />,
    );

    expect(screen.getByText('Пароль сброшен')).toBeInTheDocument();
  });

  it('показывает отозванного', () => {
    render(<UserList users={[{ ...user, isRevoked: true }]} {...handlers} />);

    expect(screen.getByText('Отозван')).toBeInTheDocument();
  });

  it('вызывает отзыв доступа', async () => {
    const onRevoke = vi.fn();
    render(<UserList users={[user]} {...handlers} onRevoke={onRevoke} />);

    await userEvent.click(screen.getByRole('button', { name: 'Отозвать доступ' }));

    expect(onRevoke).toHaveBeenCalledWith(user.id);
  });

  it('для отозванного предлагает восстановление вместо отзыва', () => {
    render(<UserList users={[{ ...user, isRevoked: true }]} {...handlers} />);

    expect(screen.getByRole('button', { name: 'Восстановить' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отозвать доступ' })).not.toBeInTheDocument();
  });

  it('спрашивает подтверждение перед сбросом пароля', async () => {
    // Сброс завершает все сессии человека — случайное нажатие дорого стоит (спека 9.1).
    const onResetPassword = vi.fn();
    render(<UserList users={[user]} {...handlers} onResetPassword={onResetPassword} />);

    await userEvent.click(screen.getByRole('button', { name: 'Сбросить пароль' }));

    expect(onResetPassword).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Да, сбросить' }));

    expect(onResetPassword).toHaveBeenCalledWith(user.id);
  });

  it('не предлагает сброс второго фактора, если он не привязан', () => {
    render(<UserList users={[user]} {...handlers} />);

    expect(screen.queryByRole('button', { name: 'Сбросить второй фактор' })).not.toBeInTheDocument();
  });
});
