'use client';

import { RoadmapVersionState } from '@cairn/shared';

import { Select } from '../Select';
// Глубокий импорт вместо бареля: через index.ts возник бы цикл
// VersionForm → VersionDrawer/index → VersionDrawer → VersionForm.
import { STATE_LABELS } from '../VersionDrawer/constants';

/** Пропсы поля состояния версии. */
interface IProps {
  value: RoadmapVersionState;
  onChange: (state: RoadmapVersionState) => void;
}

/** Состояние версии: намерение, задаётся вручную (ТЗ 3.5). */
export function StateField({ value, onChange }: IProps) {
  return (
    <div className="space-y-1">
      <label htmlFor="state" className="block text-sm font-medium">
        Состояние
      </label>
      <Select
        id="state"
        value={value}
        onChange={(next) => onChange(next as RoadmapVersionState)}
      >
        {Object.values(RoadmapVersionState).map((state) => (
          <option key={state} value={state}>
            {STATE_LABELS[state]}
          </option>
        ))}
      </Select>
    </div>
  );
}
