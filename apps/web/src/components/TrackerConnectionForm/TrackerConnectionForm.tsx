'use client';

import { parseTrackerBaseUrl } from '@cairn/shared';
import { useState, type FormEvent } from 'react';

import { FormActions } from '../FormActions';
import { TextField } from '../TextField';
import { BAD_URL_MESSAGE, BASE_URL_HINT, WORKSPACE_HINT } from './constants';
import { SecretField } from './SecretField';
import { updateOf, valuesOf } from './values';
import type { IProps, TrackerFormValues } from './types';

/**
 * Форма подключения трекера задач.
 *
 * Правки накапливаются в памяти и уходят одной кнопкой «Сохранить» —
 * идиома панели версии и формы узла модели. Адрес проверяется **той же**
 * чистой функцией контракта, что на сервере: форма отказывает до отправки и
 * теми же словами, а не своим похожим правилом.
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
  const [urlError, setUrlError] = useState<string | undefined>(undefined);

  function change<K extends keyof TrackerFormValues>(key: K, value: TrackerFormValues[K]): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    try {
      parseTrackerBaseUrl(values.baseUrl);
    } catch {
      // Код отказа один — ветка «адрес негоден» у чужого облачного
      // трекера одна, — и разбирать его незачем.
      setUrlError(BAD_URL_MESSAGE);

      return;
    }

    setUrlError(undefined);
    onSave(updateOf(values));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <TextField
          id="trackerBaseUrl"
          label="Адрес"
          value={values.baseUrl}
          onChange={(value) => change('baseUrl', value)}
        />
        <p className="text-sm text-muted-foreground">{BASE_URL_HINT}</p>
      </div>

      <div className="space-y-1">
        <TextField
          id="trackerWorkspaceId"
          label="Пространство"
          value={values.workspaceId}
          onChange={(value) => change('workspaceId', value)}
        />
        <p className="text-sm text-muted-foreground">{WORKSPACE_HINT}</p>
      </div>

      <SecretField
        hasSecret={connection.hasSecret}
        value={values.secret}
        isCleared={values.isSecretCleared}
        onChange={(value) => change('secret', value)}
        onClear={() => change('isSecretCleared', true)}
      />

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
        error={urlError ?? error}
      />
    </form>
  );
}
