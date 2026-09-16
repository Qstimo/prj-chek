'use client';

import { useState, type FormEvent } from 'react';

import { FormError } from '../FormError';
import type { IProps } from './types';

/** Установка пароля по одноразовой ссылке (спека 6.7). */
export function SetPasswordForm({ onSubmit, error, isSubmitting = false }: IProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const isTooShort = password.length > 0 && password.length < MIN_LENGTH;
  const isMismatched = confirmation.length > 0 && password !== confirmation;
  const canSubmit = password.length >= MIN_LENGTH && password === confirmation && !isSubmitting;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (canSubmit) {
      onSubmit(password);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="new-password" className="block text-sm font-medium">
          Новый пароль
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-md border border-border px-3 py-2"
        />
        {isTooShort && (
          <p className="text-sm text-destructive">Пароль должен быть не короче 12 символов</p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor="confirm-password" className="block text-sm font-medium">
          Повторите пароль
        </label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          className="w-full rounded-md border border-border px-3 py-2"
        />
        {isMismatched && <p className="text-sm text-destructive">Пароли не совпадают</p>}
      </div>

      <FormError message={error} />

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
      >
        {isSubmitting ? 'Сохранение…' : 'Сохранить пароль'}
      </button>
    </form>
  );
}

/** Минимальная длина пароля. Совпадает с проверкой контракта. */
const MIN_LENGTH = 12;
