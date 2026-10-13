import { SubjectKind } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserCard } from './UserCard';

const user = {
  id: '11111111-1111-1111-1111-111111111111',
  subjectId: '22222222-2222-2222-2222-222222222222',
  subjectKind: SubjectKind.User,
  name: 'Анна',
  email: 'anna@example.com',
  isSuperadmin: false,
  isTotpEnabled: false,
  hasPassword: true,
  isRevoked: false,
  lastLinkKind: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const handlers = {
  onRevoke: vi.fn(),
  onRestore: vi.fn(),
  onResetPassword: vi.fn(),
  onResetTotp: vi.fn(),
};

describe('UserCard', () => {
  beforeEach(() => {
    // Обработчики общие на весь файл: без сброса вызовы копились бы между тестами.
    vi.clearAllMocks();
  });

  it('показывает паспорт', () => {
    render(<UserCard user={user} {...handlers} />);

    expect(screen.getByRole('heading', { name: 'Анна' })).toBeInTheDocument();
    expect(screen.getByText('anna@example.com')).toBeInTheDocument();
    expect(screen.getByText('Активен')).toBeInTheDocument();
  });

  it('отзывает доступ', async () => {
    const onRevoke = vi.fn();
    render(<UserCard user={user} {...handlers} onRevoke={onRevoke} />);

    await userEvent.click(screen.getByRole('button', { name: 'Отозвать доступ' }));

    expect(onRevoke).toHaveBeenCalledWith(user.id);
  });

  it('у отозванного предлагает восстановление вместо отзыва', () => {
    render(<UserCard user={{ ...user, isRevoked: true }} {...handlers} />);

    expect(screen.getByRole('button', { name: 'Восстановить' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отозвать доступ' })).not.toBeInTheDocument();
  });

  it('сброс пароля требует подтверждения', async () => {
    // Сброс завершает все сессии человека — случайное нажатие дорого стоит (спека 9.1).
    const onResetPassword = vi.fn();
    render(<UserCard user={user} {...handlers} onResetPassword={onResetPassword} />);

    await userEvent.click(screen.getByRole('button', { name: 'Сбросить пароль' }));

    expect(onResetPassword).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Да, сбросить' }));

    expect(onResetPassword).toHaveBeenCalledWith(user.id);
  });

  it('не предлагает сброс второго фактора, если он не привязан', () => {
    render(<UserCard user={user} {...handlers} />);

    expect(
      screen.queryByRole('button', { name: 'Сбросить второй фактор' }),
    ).not.toBeInTheDocument();
  });

  it('предлагает сброс второго фактора, когда он привязан', async () => {
    const onResetTotp = vi.fn();
    render(<UserCard user={{ ...user, isTotpEnabled: true }} {...handlers} onResetTotp={onResetTotp} />);

    await userEvent.click(screen.getByRole('button', { name: 'Сбросить второй фактор' }));

    expect(onResetTotp).toHaveBeenCalledWith(user.id);
  });

  it('отмечает суперадмина', () => {
    render(<UserCard user={{ ...user, isSuperadmin: true }} {...handlers} />);

    expect(screen.getByText('Суперадмин')).toBeInTheDocument();
  });

  it('показывает слот правки', () => {
    render(<UserCard user={user} {...handlers} editSlot={<button type="button">Править</button>} />);

    expect(screen.getByRole('button', { name: 'Править' })).toBeInTheDocument();
  });
});
