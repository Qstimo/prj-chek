'use client';

import { useState, type FormEvent } from 'react';

import { FormActions } from '../FormActions';
import { TextField } from '../TextField';
import type { IProps, UserFormValues } from './types';

/**
 * Форма учётки: имя и почта.
 *
 * Одна на приглашение и правку — поля те же, различается только подпись
 * кнопки. Пароля здесь нет намеренно: его задаёт сам человек по
 * одноразовой ссылке, администратор чужого пароля не знает.
 */
export function UserForm({ initial, submitLabel, onSubmit, error, isSubmitting = false }: IProps) {
  const [values, setValues] = useState<UserFormValues>(initial);

  const canSubmit =
    values.name.trim().length > 0 && values.email.trim().length > 0 && !isSubmitting;

  function change<K extends keyof UserFormValues>(key: K, value: string): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    onSubmit({ name: values.name.trim(), email: values.email.trim().toLowerCase() });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <TextField
        id="user-name"
        label="Имя"
        value={values.name}
        onChange={(value) => change('name', value)}
      />
      <TextField
        id="user-email"
        label="Почта"
        type="email"
        value={values.email}
        onChange={(value) => change('email', value)}
      />

      <FormActions
        submitLabel={submitLabel}
        canSubmit={canSubmit}
        isSubmitting={isSubmitting}
        error={error}
      />
    </form>
  );
}
