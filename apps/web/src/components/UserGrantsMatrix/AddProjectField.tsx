'use client';

import { useState } from 'react';

import { Select, SelectWidth } from '../Select';
import type { ProjectCandidate } from './types';

/** Пропсы выбора проекта для новой строки. */
interface IProps {
  candidates: ProjectCandidate[];
  onAdd: (projectId: string) => void;
}

/**
 * Добавление проекта в матрицу.
 *
 * Строка появляется пустой: выдач ещё нет, и первый уровень ставится
 * селектом, как у остальных. До выдачи строка живёт только на экране.
 */
export function AddProjectField({ candidates, onAdd }: IProps) {
  const [selected, setSelected] = useState('');

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label htmlFor="add-project" className="text-sm text-muted-foreground">
        Добавить проект
      </label>
      <Select
        id="add-project"
        value={selected}
        onChange={setSelected}
        width={SelectWidth.Auto}
      >
        <option value="">выбрать…</option>
        {candidates.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name}
          </option>
        ))}
      </Select>

      <button
        type="button"
        disabled={selected === ''}
        onClick={() => {
          onAdd(selected);
          setSelected('');
        }}
        className="rounded-md border border-border px-3 py-1 text-sm disabled:opacity-50"
      >
        Добавить
      </button>
    </div>
  );
}
