'use client';

import { RoadmapVersionState, type RoadmapVersionCreate } from '@cairn/shared';
import { useState, type FormEvent } from 'react';

import { today } from '@/utils';

import { TextField } from '../TextField';
// Глубокий импорт вместо бареля: через index.ts возник бы цикл
// VersionForm → VersionDrawer/index → VersionDrawer → VersionForm.
import { STATE_LABELS } from '../VersionDrawer/constants';
import { DateField } from './DateField';
import { FormError } from '../FormError';
import type { IProps } from './types';

/** Форма версии роадмапа: обозначение, состояние, даты (ТЗ 3.5). */
export function VersionForm({
  initial,
  onSubmit,
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

      <div className="space-y-1">
        <label htmlFor="state" className="block text-sm font-medium">
          Состояние
        </label>
        <select
          id="state"
          value={state}
          onChange={(event) => handleStateChange(event.target.value as RoadmapVersionState)}
          className="w-full rounded-md border border-border px-3 py-2"
        >
          {Object.values(RoadmapVersionState).map((value) => (
            <option key={value} value={value}>
              {STATE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <DateField id="plannedDate" label="Плановая дата" value={plannedDate} onChange={setPlannedDate} />

      {isReleased && (
        <DateField id="releasedDate" label="Дата релиза" value={releasedDate} onChange={setReleasedDate} />
      )}

      <FormError message={error} />

      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
      >
        {isSubmitting ? 'Сохранение…' : 'Сохранить'}
      </button>
    </form>
  );
}

