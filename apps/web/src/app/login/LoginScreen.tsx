'use client';

import type { LoginInput, LoginResponse } from '@cairn/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiClient, ApiError } from '@/api';
import { LoginForm } from '@/components/LoginForm';
import { TotpForm } from '@/components/TotpForm';

/** Двухшаговый вход: пароль, затем при необходимости второй фактор. */
export function LoginScreen() {
  const router = useRouter();
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [isSubmitting, setSubmitting] = useState(false);

  async function submitPassword(input: LoginInput): Promise<void> {
    setSubmitting(true);
    setError(undefined);

    try {
      const response = await apiClient<LoginResponse>('/auth/login', {
        method: 'POST',
        body: input,
      });

      if (response.kind === 'totp_required') {
        setChallengeToken(response.challengeToken);

        return;
      }

      router.replace('/');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось войти');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCode(code: string): Promise<void> {
    if (!challengeToken) {
      return;
    }

    setSubmitting(true);
    setError(undefined);

    try {
      await apiClient('/auth/totp', { method: 'POST', body: { challengeToken, code } });
      router.replace('/');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось подтвердить код');
      // Челлендж исчерпан — возвращаем человека к вводу пароля.
      if (cause instanceof ApiError && cause.status === 401) {
        setChallengeToken(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">
        {challengeToken ? 'Подтверждение входа' : 'Вход в CAIRN'}
      </h1>

      {challengeToken ? (
        <TotpForm onSubmit={submitCode} error={error} isSubmitting={isSubmitting} />
      ) : (
        <LoginForm onSubmit={submitPassword} error={error} isSubmitting={isSubmitting} />
      )}
    </div>
  );
}
