'use client';

import { CustomPlatformForm } from './CustomPlatformForm';
import { PlatformSuggestions } from './PlatformSuggestions';
import type { IProps } from './types';

/**
 * Поле платформ проекта: чипы, подсказки и своя платформа.
 *
 * Что делают колбэки, решает родитель: панель создания меняет своё
 * состояние и отправляет платформы вместе с проектом, панель правки
 * вызывает мутации сразу — как галочки чекпоинтов.
 */
export function PlatformsField({ platforms, onAdd, onRemove }: IProps) {
  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium">Платформы</span>

      {platforms.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {platforms.map((platform) => (
            <li
              key={platform.id ?? platform.name}
              className="flex items-center gap-2 rounded bg-muted px-2 py-1"
            >
              <span className="text-sm">{platform.name}</span>
              <button
                type="button"
                aria-label={`Убрать ${platform.name}`}
                onClick={() => onRemove(platform)}
                className="text-sm text-muted-foreground"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <PlatformSuggestions
        taken={platforms.map((platform) => platform.name)}
        onPick={onAdd}
      />

      <CustomPlatformForm onAdd={onAdd} />
    </div>
  );
}
