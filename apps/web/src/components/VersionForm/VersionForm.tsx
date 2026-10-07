'use client';

import { RoadmapVersionState, type RoadmapVersionCreate } from '@cairn/shared';
import { useState, type FormEvent } from 'react';

import { today } from '@/utils';

import { FormActions } from '../FormActions';
import { TextField } from '../TextField';
import { DateField } from './DateField';
import { StateField } from './StateField';
import type { IProps } from './types';

/** Форма версии роадмапа: обозначение, состояние, даты (ТЗ 3.5). */
export function VersionForm({
  initial,
  onSubmit,
  onCancel,
  error,
  isSubmitting = false,
  hasPlatforms = false,
}: IProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [state, setState] = useState<RoadmapVersionState>(
    initial?.state ?? RoadmapVersionState.Planned,
  );
  const [plannedDate, setPlannedDate] = useState(initial?.plannedDate ?? '');
  const [releasedDate, setReleasedDate] = useState(initial?.releasedDate ?? '');

  // Дата релиза живёт у выпусков, когда платформы есть: поле скрыто
  // и ключ не отправляется, чтобы хранимое значение не затиралось.
  const isReleased = state === RoadmapVersionState.Released && !hasPlatforms;
  const canSubmit = label.trim().length > 0 && !isSubmitting;

  function handleStateChange(next: RoadmapVersionState): void {
    setState(next);

    // Обычный случай — релиз случился сегодня; дату можно поправить.
    if (next === RoadmapVersionState.Released && releasedDate.length === 0) {
      setReleasedDate(today());
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    onSubmit({
      label: label.trim(),
      state,
      plannedDate: plannedDate.length > 0 ? plannedDate : null,
      // Не «выпущена» — null, чтобы дата не залипала от прежнего состояния.
      // При платформах ключа нет вовсе: `undefined` означает «не трогать».
      ...(hasPlatforms
        ? {}
        : { releasedDate: isReleased && releasedDate.length > 0 ? releasedDate : null }),
    } satisfies RoadmapVersionCreate);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <TextField id="label" label="Обозначение" value={label} onChange={setLabel} />

      <StateField value={state} onChange={handleStateChange} />


      <DateField id="plannedDate" label="Плановая дата" value={plannedDate} onChange={setPlannedDate} />

      {isReleased && (
        <DateField id="releasedDate" label="Дата релиза" value={releasedDate} onChange={setReleasedDate} />
      )}

      <FormActions
        submitLabel="Сохранить"
        canSubmit={canSubmit}
        isSubmitting={isSubmitting}
        onCancel={onCancel}
        error={error}
      />
    </form>
  );
}

