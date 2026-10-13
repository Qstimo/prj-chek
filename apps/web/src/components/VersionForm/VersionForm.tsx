'use client';

import { RoadmapVersionState, type RoadmapVersionCreate } from '@cairn/shared';
import { useState, type FormEvent } from 'react';

import { FormActions } from '../FormActions';
import { VersionFields, type IVersionPassportDraft } from '../VersionFields';
import type { IProps } from './types';

/**
 * Форма создания версии роадмапа (ТЗ 3.5).
 *
 * Поля — общие с панелью версии (`VersionFields`), своя здесь только
 * кнопка: версия заводится одним действием, а правится черновиком панели.
 */
export function VersionForm({
  initial,
  onSubmit,
  onCancel,
  error,
  isSubmitting = false,
  hasPlatforms = false,
}: IProps) {
  const [draft, setDraft] = useState<IVersionPassportDraft>({
    label: initial?.label ?? '',
    state: initial?.state ?? RoadmapVersionState.Planned,
    plannedDate: initial?.plannedDate ?? '',
    releasedDate: initial?.releasedDate ?? '',
  });

  // Дата релиза живёт у выпусков, когда платформы есть: поле скрыто
  // и ключ не отправляется, чтобы хранимое значение не затиралось.
  const isReleased = draft.state === RoadmapVersionState.Released && !hasPlatforms;
  const canSubmit = draft.label.trim().length > 0 && !isSubmitting;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    onSubmit({
      label: draft.label.trim(),
      state: draft.state,
      plannedDate: draft.plannedDate.length > 0 ? draft.plannedDate : null,
      // Не «выпущена» — null, чтобы дата не залипала от прежнего состояния.
      // При платформах ключа нет вовсе: `undefined` означает «не трогать».
      ...(hasPlatforms
        ? {}
        : { releasedDate: isReleased && draft.releasedDate.length > 0 ? draft.releasedDate : null }),
    } satisfies RoadmapVersionCreate);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <VersionFields draft={draft} onChange={setDraft} hasPlatforms={hasPlatforms} />

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
