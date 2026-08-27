'use client';

import type { TotpSetupResponse } from '@cairn/shared';
import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../client';

/** Начало привязки второго фактора. */
export function useMutationTotpSetup() {
  return useMutation({
    mutationFn: () => apiClient<TotpSetupResponse>('/auth/totp/setup', { method: 'POST' }),
  });
}

/** Подтверждение привязки второго фактора. */
export function useMutationTotpConfirm() {
  return useMutation({
    mutationFn: (code: string) =>
      apiClient('/auth/totp/confirm', { method: 'POST', body: { code } }),
  });
}
