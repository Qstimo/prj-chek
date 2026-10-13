import { InvitationKind, SubjectKind } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { UserList } from './UserList';

const user = {
  id: '11111111-1111-1111-1111-111111111111',
  subjectId: '22222222-2222-2222-2222-222222222222',
  subjectKind: SubjectKind.User,
  name: 'Анна',
  email: 'user@cairn.local',
  isSuperadmin: false,
  isTotpEnabled: false,
  hasPassword: true,
  isRevoked: false,
  lastLinkKind: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('UserList', () => {
  it('показывает имя и адрес пользователя', () => {
    render(<UserList users={[user]} />);

    expect(screen.getByText('Анна')).toBeInTheDocument();
    expect(screen.getByText('user@cairn.local')).toBeInTheDocument();
  });

  it('ведёт на карточку', () => {
    // Действия живут на карточке: в списке — обзор и переход.
    render(<UserList users={[user]} />);

    expect(screen.getByRole('link', { name: /Анна/ })).toHaveAttribute(
      'href',
      `/users/${user.id}`,
    );
  });

  it('отмечает суперадмина', () => {
    render(<UserList users={[{ ...user, isSuperadmin: true }]} />);

    expect(screen.getByText('Суперадмин')).toBeInTheDocument();
  });

  it('показывает приглашённого, ещё не задавшего пароль', () => {
    render(
      <UserList users={[{ ...user, hasPassword: false, lastLinkKind: InvitationKind.Invitation }]} />,
    );

    expect(screen.getByText('Приглашён')).toBeInTheDocument();
  });

  it('отличает сброшенный пароль от приглашения', () => {
    // Оба состояния — «нет действующего пароля», различает их вид ссылки (спека 4.2).
    render(
      <UserList
        users={[{ ...user, hasPassword: false, lastLinkKind: InvitationKind.PasswordReset }]}
      />,
    );

    expect(screen.getByText('Пароль сброшен')).toBeInTheDocument();
  });

  it('показывает отозванного', () => {
    render(<UserList users={[{ ...user, isRevoked: true }]} />);

    expect(screen.getByText('Отозван')).toBeInTheDocument();
  });
});
