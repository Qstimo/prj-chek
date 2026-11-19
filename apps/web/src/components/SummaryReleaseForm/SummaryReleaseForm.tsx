'use client';

import { RoadmapVersionState } from '@cairn/shared';
import { useState, type FormEvent } from 'react';

import { today } from '@/utils';

import { FormActions } from '../FormActions';
import { Select } from '../Select';
import { TextField } from '../TextField';
import { DateField, StateField } from '../VersionFields';
import {
  FIELD_LABELS,
  RELEASE_TEXTS,
  TARGET_LABELS,
  appendNoteOf,
  checkpointsNoteOf,
} from './constants';
import type { IProps, IReleaseFormValues } from './types';

/**
 * Формирование версии роадмапа из отмеченных задач.
 *
 * Свой компонент, а не `VersionFields`: набор полей здесь намеренно уже, и
 * переиспользовать тот пришлось бы соврав его пропу `hasPlatforms`.
 * Внутренние `StateField` и `DateField` переиспользуются как есть.
 *
 * Цель — новая версия или уже существующая, и у второй полей версии нет
 * вовсе: спрашивать обозначение у версии, у которой оно уже есть, незачем
 * (дизайн, 4.5). Выбор цели не показывается, пока версий нет: выбирать
 * было бы нечего.
 *
 * Поля «Дата релиза» нет **ни при каких условиях**, и `releasedDate` не
 * отправляется никогда — даже `null`. Причина не в том, что версия из
 * созвона всегда впереди: чтобы **узнать**, есть ли у проекта платформы,
 * нужен уровень на «Инфо», которого у субъекта этого потока может не быть
 * вовсе, и форма, которая показывает поле по признаку из недоступной
 * секции, этим признаком протекает (дизайн конструктора, раздел 7.5).
 * Поэтому платформы проекта форма не запрашивает совсем.
 */
export function SummaryReleaseForm({
  suggestedLabel,
  taskCount,
  versions = [],
  onSubmit,
  isRoadmapPublic = false,
  isSubmitting = false,
  error,
}: IProps) {
  const [values, setValues] = useState<IReleaseFormValues>({
    label: suggestedLabel ?? '',
    state: RoadmapVersionState.Planned,
    plannedDate: today(),
  });
  const [isExisting, setIsExisting] = useState(false);
  // Первая версия списка, а не пустой выбор: селект без значения дал бы
  // отправку «в никуда», а пустая опция-заглушка — ещё один способ
  // ничего не выбрать.
  const [versionId, setVersionId] = useState(versions[0]?.id ?? '');

  const chosen = versions.find((version) => version.id === versionId);
  const canSubmit = isSubmitting
    ? false
    : isExisting
      ? chosen !== undefined
      : values.label.trim().length > 0;

  function change<K extends keyof IReleaseFormValues>(key: K, value: IReleaseFormValues[K]): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    if (isExisting && chosen !== undefined) {
      onSubmit({ kind: 'existing', versionId: chosen.id });

      return;
    }

    onSubmit({
      kind: 'new',
      version: {
        label: values.label.trim(),
        state: values.state,
        plannedDate: values.plannedDate.length > 0 ? values.plannedDate : null,
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {isExisting && chosen !== undefined
          ? appendNoteOf(taskCount, chosen.label)
          : checkpointsNoteOf(taskCount)}
      </p>

      {versions.length > 0 && (
        <div className="space-y-1">
          <label htmlFor="target" className="block text-sm">
            {FIELD_LABELS.target}
          </label>
          <Select
            id="target"
            value={isExisting ? 'existing' : 'new'}
            onChange={(kind) => setIsExisting(kind === 'existing')}
          >
            <option value="new">{TARGET_LABELS.new}</option>
            <option value="existing">{TARGET_LABELS.existing}</option>
          </Select>
        </div>
      )}

      {isExisting ? (
        <div className="space-y-1">
          <label htmlFor="version" className="block text-sm">
            {FIELD_LABELS.version}
          </label>
          <Select id="version" value={versionId} onChange={setVersionId}>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.label}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <>
          {suggestedLabel === null && (
            <p className="text-sm text-muted-foreground">{RELEASE_TEXTS.noSuggestion}</p>
          )}

          <TextField
            id="label"
            label={FIELD_LABELS.label}
            value={values.label}
            onChange={(label) => change('label', label)}
          />

          <StateField value={values.state} onChange={(state) => change('state', state)} />

          <DateField
            id="plannedDate"
            label={FIELD_LABELS.plannedDate}
            value={values.plannedDate}
            onChange={(plannedDate) => change('plannedDate', plannedDate)}
          />
        </>
      )}

      {isRoadmapPublic && (
        <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          {RELEASE_TEXTS.publicWarning}
        </p>
      )}

      <FormActions
        submitLabel={RELEASE_TEXTS.submit}
        canSubmit={canSubmit}
        isSubmitting={isSubmitting}
        error={error}
      />
    </form>
  );
}
