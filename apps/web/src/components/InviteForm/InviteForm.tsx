'use client';

import { useState, type FormEvent } from 'react';

import { TextField } from '../TextField';
import type { IProps } from './types';

/** Приглашение нового пользователя по адресу почты (спека 6.7). */
export function InviteForm({ onSubmit, error, isSubmitting = false }: IProps) {
  const [email, setEmail] = useState('');

  const canSubmit = email.trim().length > 0 && !isSubmitting;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (canSubmit) {
      onSubmit({ email: email.trim().toLowerCase() });
      setEmail('');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="min-w-64 flex-1">
        <TextField
          id="invite-email"
          label="Пригласить по адресу"
          type="email"
          value={email}
          onChange={setEmail}
        />
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
      >
        {isSubmitting ? 'Создание…' : 'Пригласить'}
      </button>

      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
