'use client';

import {
  releaseStatesFor,
  type Platform,
  type PlatformRelease,
  type PlatformReleaseSet,
  PlatformReleaseState,
} from '@cairn/shared';

import { today } from '@/utils';

import { RELEASE_STATE_LABELS } from '../ReleaseSummary';

/** Пропсы строки выпуска. */
interface IProps {
  platform: Platform;
  /** Выпуск платформы в этой версии; `undefined` — «как у версии». */
  release?: PlatformRelease;
  /** Правка. Отсутствие — строка только на просмотр. */
  onSet?: (platformId: string, input: PlatformReleaseSet) => void;
  onClear?: (platformId: string) => void;
}

/**
 * Выпуск одной платформы в версии.
 *
 * Отправляется вся тройка, а не одно изменённое поле: `PUT` заменяет
 * клетку целиком, и посылка одного состояния обнулила бы дату
 * и обозначение сборки.
 */
export function ReleaseRow({ platform, release, onSet, onClear }: IProps) {
  function change(next: string): void {
    if (next === '') {
      onClear?.(platform.id);

      return;
    }

    const state = next as PlatformReleaseState;
    // Обычный случай — релиз случился сегодня; дату можно поправить
    // в поле рядом.
    const releasedDate =
      state === PlatformReleaseState.Released ? (release?.releasedDate ?? today()) : (release?.releasedDate ?? null);

    onSet?.(platform.id, { state, releasedDate, buildLabel: release?.buildLabel ?? null });
  }

  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className="min-w-32 text-sm">{platform.name}</span>

      {onSet ? (
        <select
          aria-label={`Состояние ${platform.name}`}
          value={release?.state ?? ''}
          onChange={(event) => change(event.target.value)}
          className="rounded-md border border-border px-2 py-1 text-sm"
        >
          <option value="">как у версии</option>
          {releaseStatesFor(platform.kind).map((state) => (
            <option key={state} value={state}>
              {RELEASE_STATE_LABELS[state]}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-sm text-muted-foreground">
          {release ? RELEASE_STATE_LABELS[release.state] : 'как у версии'}
        </span>
      )}

      {release?.buildLabel && (
        <span className="text-sm text-muted-foreground">{release.buildLabel}</span>
      )}
    </li>
  );
}
