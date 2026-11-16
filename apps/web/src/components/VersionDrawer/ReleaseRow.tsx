'use client';

import { releaseStatesFor, PlatformReleaseState, type Platform } from '@cairn/shared';

import { formatDate, today } from '@/utils';

import { Select } from '../Select';
import { RELEASE_STATE_LABELS } from '../ReleaseSummary';
import { CELL_INPUT_CLASSES, NO_RELEASE_LABEL } from './constants';
import type { IReleaseCell } from './types';

/** Пропсы строки выпуска. */
interface IProps {
  platform: Platform;
  /** Клетка черновика; `null` — «как у версии». */
  cell: IReleaseCell | null;
  /** Обозначение версии: подсказка для пустого обозначения сборки. */
  versionLabel: string;
  /** Правка клетки. Отсутствие — строка только на просмотр. */
  onChange?: (platformId: string, cell: IReleaseCell | null) => void;
}

/**
 * Выпуск одной платформы в версии: состояние, дата, обозначение сборки.
 *
 * Запросов не делает — меняет черновик. Все три поля уезжают на сервер
 * вместе, одной кнопкой панели: `PUT` заменяет клетку целиком, и отправка
 * по каждому нажатию клавиши была бы и лишней, и затирающей.
 *
 * Подписи называют платформу: на панели с тремя платформами три «Даты»
 * неразличимы ни на слух, ни в тестах.
 */
export function ReleaseRow({ platform, cell, versionLabel, onChange }: IProps) {
  const isReleased = cell?.state === PlatformReleaseState.Released;

  function changeState(next: string): void {
    if (next === '') {
      onChange?.(platform.id, null);

      return;
    }

    const state = next as PlatformReleaseState;

    onChange?.(platform.id, {
      state,
      // Обычный случай — релиз случился сегодня; дату можно поправить
      // в поле рядом. У остальных состояний даты нет вовсе: поле
      // скрывается, и оставленное под ним значение стало бы невидимой
      // правдой, а сводка считает, что у того, что в пути, даты выхода
      // ещё нет.
      releasedDate:
        state === PlatformReleaseState.Released ? cell?.releasedDate || today() : '',
      buildLabel: cell?.buildLabel ?? '',
    });
  }

  if (!onChange) {
    return (
      <li className="flex flex-wrap items-center gap-2 text-sm">
        <span className="w-40 max-w-full shrink-0 break-words [overflow-wrap:anywhere]">
          {platform.name}
        </span>
        <span className="inline-flex min-h-9 w-36 max-w-full shrink-0 items-center rounded bg-muted px-2 text-muted-foreground">
          {cell ? RELEASE_STATE_LABELS[cell.state] : NO_RELEASE_LABEL}
        </span>
        {cell?.releasedDate && (
          <time
            dateTime={cell.releasedDate}
            className="w-36 max-w-full shrink-0 whitespace-nowrap tabular-nums text-muted-foreground"
          >
            {formatDate(cell.releasedDate)}
          </time>
        )}
        {cell?.buildLabel && (
          <span className="w-40 max-w-full shrink-0 break-words [overflow-wrap:anywhere] text-muted-foreground">
            {cell.buildLabel}
          </span>
        )}
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className="w-40 max-w-full shrink-0 break-words [overflow-wrap:anywhere] text-sm">
        {platform.name}
      </span>

      <div className="w-36 max-w-full shrink-0">
        <Select
          label={`Состояние ${platform.name}`}
          value={cell?.state ?? ''}
          onChange={changeState}
        >
          <option value="">{NO_RELEASE_LABEL}</option>
          {releaseStatesFor(platform.kind).map((state) => (
            <option key={state} value={state}>
              {RELEASE_STATE_LABELS[state]}
            </option>
          ))}
        </Select>
      </div>

      {cell && isReleased && (
        <input
          type="date"
          aria-label={`Дата ${platform.name}`}
          value={cell.releasedDate}
          onChange={(event) =>
            onChange(platform.id, { ...cell, releasedDate: event.target.value })
          }
          className={`${CELL_INPUT_CLASSES} w-36 max-w-full min-w-0 shrink-0 tabular-nums`}
        />
      )}

      {cell && (
        <input
          type="text"
          aria-label={`Сборка ${platform.name}`}
          value={cell.buildLabel}
          placeholder={versionLabel}
          onChange={(event) => onChange(platform.id, { ...cell, buildLabel: event.target.value })}
          title={cell.buildLabel || versionLabel}
          className={`${CELL_INPUT_CLASSES} w-40 max-w-full min-w-0 shrink-0`}
        />
      )}
    </li>
  );
}
