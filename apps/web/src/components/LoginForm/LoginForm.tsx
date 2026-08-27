'use client';

import { useState, type FormEvent } from 'react';

import { ERROR_ID, FIELD_LABELS } from './constants';
import type { IProps } from './types';

/** Первый шаг входа: адрес и пароль (спека 6.1). */
export function LoginForm({ onSubmit, error, isSubmitting = false }: IProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const canSubmit = email.trim().length > 0 && password.length > 0 && !isSubmitting;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    onSubmit({ email: email.trim().toLowerCase(), password });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-describedby={error ? ERROR_ID : undefined}>
      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium">
          {FIELD_LABELS.email}
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-md border border-border px-3 py-2"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="block text-sm font-medium">
          {FIELD_LABELS.password}
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-md border border-border px-3 py-2"
        />
      </div>

      {error && (
        <p id={ERROR_ID} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
      >
        {isSubmitting ? 'Вход…' : 'Войти'}
      </button>
    </form>
  );
}
