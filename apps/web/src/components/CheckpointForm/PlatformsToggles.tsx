'use client';

import type { Platform } from '@cairn/shared';

/** Пропсы переключателей платформ. */
interface IProps {
  platforms: Platform[];
  value: string[];
  onChange: (platformIds: string[]) => void;
  /** Различитель идентификаторов: форм на панели бывает две. */
  idPrefix: string;
}

/**
 * Платформы, на которые едет результат чекпоинта.
 *
 * Необязательно и больше одной: «вход по телефону» едет и в iOS,
 * и в Android. Это не исполнитель и не оценка — ограничение ТЗ 1.4
 * остаётся в силе.
 */
export function PlatformsToggles({ platforms, value, onChange, idPrefix }: IProps) {
  if (platforms.length === 0) {
    return null;
  }

  function toggle(platformId: string): void {
    onChange(
      value.includes(platformId)
        ? value.filter((item) => item !== platformId)
        : [...value, platformId],
    );
  }

  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">Платформы</legend>

      <div className="flex flex-wrap gap-3">
        {platforms.map((platform) => (
          <div key={platform.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`${idPrefix}-platform-${platform.id}`}
              checked={value.includes(platform.id)}
              onChange={() => toggle(platform.id)}
            />
            <label htmlFor={`${idPrefix}-platform-${platform.id}`} className="text-sm">
              {platform.name}
            </label>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
