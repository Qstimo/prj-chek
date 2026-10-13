'use client';

import { RoadmapVersionState } from '@cairn/shared';

import { today } from '@/utils';

import { TextField } from '../TextField';
import { DateField } from './DateField';
import { StateField } from './StateField';
import type { IProps, IVersionPassportDraft } from './types';

/**
 * Поля паспорта версии без своих кнопок.
 *
 * Отдельно от формы, потому что сохраняются они в двух разных местах:
 * панель создания отправляет их своей кнопкой, а панель версии — общей
 * кнопкой черновика в шапке, вместе с выпусками платформ.
 */
export function VersionFields({ draft, onChange, hasPlatforms = false }: IProps) {
  const isReleased = draft.state === RoadmapVersionState.Released && !hasPlatforms;

  function change(fields: Partial<IVersionPassportDraft>): void {
    onChange({ ...draft, ...fields });
  }

  function changeState(state: RoadmapVersionState): void {
    // Обычный случай — релиз случился сегодня; дату можно поправить.
    const shouldFillDate =
      state === RoadmapVersionState.Released && draft.releasedDate.length === 0;

    change({ state, ...(shouldFillDate ? { releasedDate: today() } : {}) });
  }

  return (
    <div className="space-y-4">
      <TextField
        id="label"
        label="Обозначение"
        value={draft.label}
        onChange={(label) => change({ label })}
      />

      <StateField value={draft.state} onChange={changeState} />

      <DateField
        id="plannedDate"
        label="Плановая дата"
        value={draft.plannedDate}
        onChange={(plannedDate) => change({ plannedDate })}
      />

      {isReleased && (
        <DateField
          id="releasedDate"
          label="Дата релиза"
          value={draft.releasedDate}
          onChange={(releasedDate) => change({ releasedDate })}
        />
      )}
    </div>
  );
}
