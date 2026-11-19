'use client';

import { PlatformsToggles } from '../CheckpointForm';
import { EDITOR_TEXTS } from './constants';
import type { IDetailsProps } from './types';

/**
 * Нижняя часть карточки: ссылка на задачу и теги платформ.
 *
 * Отдельным компонентом, чтобы `TaskRow` осталась в пределах ста строк, а
 * не потому, что это своя сущность: это часть той же карточки и живёт
 * под формулировкой.
 *
 * Чекбоксы платформ — существующий `PlatformsToggles` формы чекпоинта:
 * теги уезжают в тот же чекпоинт, и второй набор тех же чекбоксов
 * разошёлся бы с первым. На пустом списке он возвращает `null` сам, и
 * блока платформ не появляется вовсе.
 *
 * Поле ссылки — свой `input type="url"`, а не `CheckpointFields`: тот
 * несёт вместе с адресом многострочную формулировку и отправку по
 * Ctrl+Enter, то есть форму целиком, а здесь поле едет в список.
 */
export function TaskDetails({
  task,
  platforms,
  onUrlChange,
  onPlatformsChange,
  urlError,
}: IDetailsProps) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <input
          type="url"
          aria-label={EDITOR_TEXTS.urlLabel}
          placeholder={EDITOR_TEXTS.urlLabel}
          value={task.url}
          onChange={(event) => onUrlChange(event.target.value)}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />

        {urlError !== undefined && <p className="text-sm text-destructive">{urlError}</p>}
      </div>

      <PlatformsToggles
        platforms={platforms}
        value={task.platformIds}
        onChange={onPlatformsChange}
        idPrefix={task.key}
      />
    </div>
  );
}
