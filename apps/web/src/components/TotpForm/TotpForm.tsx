'use client';

import { useState, type FormEvent } from 'react';

import type { IProps } from './types';

/** Второй шаг входа: код из приложения-аутентификатора (спека 6.1). */
export function TotpForm({ onSubmit, error, isSubmitting = false }: IProps) {
  const [code, setCode] = useState('');

  const canSubmit = code.length === CODE_LENGTH && !isSubmitting;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (canSubmit) {
      onSubmit(code);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="totp-code" className="block text-sm font-medium">
          Код из приложения
        </label>
        <input
          id="totp-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => setCode(onlyDigits(event.target.value))}
          className="w-full rounded-md border border-border px-3 py-2 text-center text-lg tracking-widest"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
      >
        {isSubmitting ? 'Проверка…' : 'Подтвердить'}
      </button>

      <p className="text-sm text-muted-foreground">
        Потеряли доступ к приложению? Обратитесь к администратору — он снимет привязку.
      </p>
    </form>
  );
}

/** Оставляет только цифры и обрезает до нужной длины. */
function onlyDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, CODE_LENGTH);
}

/** Длина кода. */
const CODE_LENGTH = 6;
