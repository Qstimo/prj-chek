'use client';

import { TotpForm } from '../TotpForm';
import type { IProps } from './types';

/** Привязка второго фактора (спека 6.4). */
export function TotpSetup({ setup, onConfirm, error, isSubmitting }: IProps) {
  return (
    <div className="space-y-4">
      <p>
        Откройте приложение-аутентификатор и добавьте учётную запись вручную, введя ключ ниже.
        Затем подтвердите привязку кодом из приложения.
      </p>

      <p className="break-all rounded-md bg-muted p-3 font-mono">{setup.secret}</p>

      <TotpForm onSubmit={onConfirm} error={error} isSubmitting={isSubmitting} />
    </div>
  );
}
