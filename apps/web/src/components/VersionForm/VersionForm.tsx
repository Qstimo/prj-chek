'use client';

import { RoadmapVersionState, type RoadmapVersionCreate } from '@cairn/shared';
import { useState, type FormEvent } from 'react';

import { TextField } from '../TextField';
import { STATE_LABELS } from '../VersionCard';
import type { IProps } from './types';

/** Форма версии роадмапа: обозначение, состояние, плановая дата (ТЗ 3.5). */
export function VersionForm({ initial, onSubmit, error, isSubmitting = false }: IProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [state, setState] = useState<RoadmapVersionState>(
    initial?.state ?? RoadmapVersionState.Planned,
  );
  const [plannedDate, setPlannedDate] = useState(initial?.plannedDate ?? '');

  const canSubmit = label.trim().length > 0 && !isSubmitting;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    onSubmit({
      label: label.trim(),
      state,
      plannedDate: plannedDate.length > 0 ? plannedDate : null,
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
          onChange={(event) => setState(event.target.value as RoadmapVersionState)}
          className="w-full rounded-md border border-border px-3 py-2"
        >
          {Object.values(RoadmapVersionState).map((value) => (
            <option key={value} value={value}>
              {STATE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="plannedDate" className="block text-sm font-medium">
          Плановая дата
        </label>
        <input
          id="plannedDate"
          type="date"
          value={plannedDate}
          onChange={(event) => setPlannedDate(event.target.value)}
          className="rounded-md border border-border px-3 py-2"
        />
      </div>

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
