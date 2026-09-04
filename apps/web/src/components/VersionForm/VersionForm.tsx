'use client';

import { RoadmapVersionState, type RoadmapVersionCreate } from '@cairn/shared';
import { useState, type FormEvent } from 'react';

import { TextField } from '../TextField';
import { STATE_LABELS } from '../VersionDrawer';
import { DateField } from './DateField';
import type { IProps } from './types';

/** Форма версии роадмапа: обозначение, состояние, даты (ТЗ 3.5). */
export function VersionForm({ initial, onSubmit, error, isSubmitting = false }: IProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [state, setState] = useState<RoadmapVersionState>(
    initial?.state ?? RoadmapVersionState.Planned,
  );
  const [plannedDate, setPlannedDate] = useState(initial?.plannedDate ?? '');
  const [releasedDate, setReleasedDate] = useState(initial?.releasedDate ?? '');

  const isReleased = state === RoadmapVersionState.Released;
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
      releasedDate: isReleased && releasedDate.length > 0 ? releasedDate : null,
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

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

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

/** Сегодняшний день `ГГГГ-ММ-ДД` по местному времени (sv-SE даёт ISO-порядок). */
function today(): string {
  return new Intl.DateTimeFormat('sv-SE').format(new Date());
}
