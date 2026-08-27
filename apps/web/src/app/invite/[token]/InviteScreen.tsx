'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiClient, ApiError } from '@/api';
import { SetPasswordForm } from '@/components/SetPasswordForm';

/** Пропсы экрана приглашения. */
interface IProps {
  token: string;
}

/**
 * Установка пароля по ссылке.
 *
 * Если у пользователя привязан второй фактор, ответ не содержит сессии —
 * человек отправляется на обычный вход, где введёт код (спека 4.6).
 */
export function InviteScreen({ token }: IProps) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [isSubmitting, setSubmitting] = useState(false);

  async function submit(password: string): Promise<void> {
    setSubmitting(true);
    setError(undefined);

    try {
      const response = await apiClient<{ kind: 'session' | 'totp_required' }>(
        `/invitations/${token}/accept`,
        { method: 'POST', body: { password } },
      );

      router.replace(response.kind === 'session' ? '/' : '/login');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось сохранить пароль');
    } finally {
      setSubmitting(false);
    }
  }

  return <SetPasswordForm onSubmit={submit} error={error} isSubmitting={isSubmitting} />;
}
