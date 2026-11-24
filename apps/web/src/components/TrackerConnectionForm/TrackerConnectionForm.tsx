'use client';

import { useState, type FormEvent } from 'react';

import { FormActions } from '../FormActions';
import { TextField } from '../TextField';
import { WORKSPACE_HINT } from './constants';
import { SecretField } from './SecretField';
import { updateOf, valuesOf } from './values';
import type { IProps, TrackerFormValues } from './types';

/**
 * Форма подключения трекера задач.
 *
 * Адрес API Weeek задан приложением; человек вводит только свои настройки.
 *
 * Полей вчетверо меньше, чем у узла модели, и это не упрощение: у трекера
 * нет ни имени модели, ни схемы авторизации, ни размещения, ни предела
 * ожидания в настройке — токен предъявляется одним способом
 * (`Authorization: Bearer`), а предел принадлежит нашему потоку, а не
 * провайдеру.
 */
export function TrackerConnectionForm({
  connection,
  onSave,
  onClose,
  error,
  isSubmitting = false,
}: IProps) {
  const [values, setValues] = useState<TrackerFormValues>(valuesOf(connection));

  function change<K extends keyof TrackerFormValues>(key: K, value: TrackerFormValues[K]): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    onSave(updateOf(values));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        В Weeek откройте настройки рабочего пространства → API → «Добавить токен».
        После сохранения проверьте связь, затем выберите доску на странице задач проекта.
      </p>

      <SecretField
        hasSecret={connection.hasSecret}
        value={values.secret}
        isCleared={values.isSecretCleared}
        onChange={(value) => change('secret', value)}
        onClear={() => change('isSecretCleared', true)}
      />

      <details className="space-y-2 text-sm">
        <summary className="cursor-pointer">Дополнительные настройки ссылок</summary>
      <div className="space-y-1">
        <TextField
          id="trackerWorkspaceId"
          label="Пространство"
          value={values.workspaceId}
          onChange={(value) => change('workspaceId', value)}
        />
        <p className="text-sm text-muted-foreground">{WORKSPACE_HINT}</p>
      </div>

      </details>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.isEnabled}
          onChange={(event) => change('isEnabled', event.target.checked)}
        />
        Включено
      </label>

      <FormActions
        submitLabel="Сохранить"
        canSubmit={!isSubmitting}
        isSubmitting={isSubmitting}
        onCancel={onClose}
        error={error}
      />
    </form>
  );
}
