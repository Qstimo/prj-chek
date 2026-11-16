'use client';

import { RoadmapVersionState } from '@cairn/shared';
import { useState, type FormEvent } from 'react';

import { today } from '@/utils';

import { FormActions } from '../FormActions';
import { TextField } from '../TextField';
import { DateField, StateField } from '../VersionFields';
import { FIELD_LABELS, RELEASE_TEXTS, checkpointsNoteOf } from './constants';
import type { IProps, IReleaseFormValues } from './types';

/**
 * Формирование версии роадмапа из черновика задач.
 *
 * Свой компонент, а не `VersionFields`: набор полей здесь намеренно уже, и
 * переиспользовать тот пришлось бы соврав его пропу `hasPlatforms`.
 * Внутренние `StateField` и `DateField` переиспользуются как есть.
 *
 * Поля «Дата релиза» нет **ни при каких условиях**, и `releasedDate` не
 * отправляется никогда — даже `null`. Причина не в том, что версия из
 * созвона всегда впереди: чтобы **узнать**, есть ли у проекта платформы,
 * нужен уровень на «Инфо», которого у субъекта этого потока может не быть
 * вовсе, и форма, которая показывает поле по признаку из недоступной
 * секции, этим признаком протекает (дизайн, раздел 7.5). Поэтому платформы
 * проекта форма не запрашивает совсем.
 */
export function SummaryReleaseForm({
  suggestedLabel,
  taskCount,
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

  const canSubmit = values.label.trim().length > 0 && !isSubmitting;

  function change<K extends keyof IReleaseFormValues>(key: K, value: IReleaseFormValues[K]): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    onSubmit({
      label: values.label.trim(),
      state: values.state,
      plannedDate: values.plannedDate.length > 0 ? values.plannedDate : null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">{checkpointsNoteOf(taskCount)}</p>

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
