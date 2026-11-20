'use client';

import { parseModelServiceBaseUrl } from '@cairn/shared';
import { useState, type FormEvent } from 'react';

import { ConfirmDialog } from '../ConfirmDialog';
import { FormActions } from '../FormActions';
import { PRESETS_BY_KIND, UNVERIFIED_PRESET_NOTE, URL_ERROR_MESSAGES } from './constants';
import { LimitFields } from './LimitFields';
import { NodeFields } from './NodeFields';
import { SecretField } from './SecretField';
import { SelectField } from './SelectField';
import { updateOf, valuesOf } from './values';
import type { IProps, ModelServiceFormValues, Preset } from './types';

/**
 * Форма настройки узла службы модели.
 *
 * Правки накапливаются в памяти и уходят одной кнопкой «Сохранить» —
 * идиома панели версии. Адрес проверяется **той же** чистой функцией
 * контракта, что на сервере: форма отказывает до отправки и теми же
 * словами, а не своим похожим правилом.
 *
 * Пресет не свойство настройки, а действие: он не хранится, при открытии
 * не восстанавливается и заполненные поля затирает только с согласия.
 *
 * Набор заготовок, выбор вида и подпись у каталога зависят от **узла**:
 * у разбивки и распознавания провайдеры разные, и один перечень на оба
 * предлагал бы узлу распознавания адрес чат-модели — настройку, которая
 * сохранится и не заработает.
 */
export function ModelServiceForm({
  settings,
  onSave,
  onClose,
  error,
  isSubmitting = false,
}: IProps) {
  const [values, setValues] = useState<ModelServiceFormValues>(valuesOf(settings));
  const [preset, setPreset] = useState<Preset | null>(null);
  const [pending, setPending] = useState<Preset | null>(null);
  const [urlError, setUrlError] = useState<string | undefined>(undefined);
  const presets = PRESETS_BY_KIND[settings.kind];

  function change<K extends keyof ModelServiceFormValues>(
    key: K,
    value: ModelServiceFormValues[K],
  ): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  /** Применяет заготовку: заполняет адрес и схему, модель не трогает. */
  function apply(chosen: Preset): void {
    setPreset(chosen);
    setPending(null);
    setValues((current) => ({
      ...current,
      baseUrl: chosen.baseUrl,
      authScheme: chosen.authScheme,
    }));
  }

  /** Выбор заготовки: заполненный адрес затирается только с согласия. */
  function choose(value: string): void {
    const chosen = presets.find((candidate) => candidate.value === value);

    if (!chosen) {
      return;
    }

    if (values.baseUrl.trim() === '') {
      apply(chosen);
    } else {
      setPending(chosen);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    try {
      parseModelServiceBaseUrl(values.baseUrl, values.placement);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : '';

      setUrlError(URL_ERROR_MESSAGES[code] ?? 'Адрес негоден.');

      return;
    }

    setUrlError(undefined);
    onSave(updateOf(values));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <SelectField
        id="preset"
        label="Пресет"
        value={preset?.value ?? ''}
        onChange={choose}
        options={[{ value: '', label: 'Не выбран' }, ...presets]}
        hint={preset?.isUnverified ? UNVERIFIED_PRESET_NOTE : undefined}
      />

      {pending && (
        <ConfirmDialog
          label="Применить пресет"
          confirmLabel="Да, заменить"
          onConfirm={() => apply(pending)}
          onCancel={() => setPending(null)}
        >
          Адрес и схема будут заменены значениями пресета «{pending.label}». Имя модели останется
          как есть.
        </ConfirmDialog>
      )}

      <NodeFields
        values={values}
        onChange={change}
        kind={settings.kind}
        modelHint={preset?.modelHint}
      />

      <LimitFields values={values} onChange={change} kind={settings.kind} />

      <SecretField
        hasSecret={settings.hasSecret}
        value={values.secret}
        isCleared={values.isSecretCleared}
        onChange={(value) => change('secret', value)}
        onClear={() => change('isSecretCleared', true)}
      />

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
