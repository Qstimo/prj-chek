'use client';

import { PlatformKind, type PlatformRef } from '@cairn/shared';

/** Пропсы группы платформ окружения. */
interface IProps {
  platforms: PlatformRef[];
  value: string[];
  onChange: (platformIds: string[]) => void;
}

/**
 * Что развёрнуто в окружении.
 *
 * Только платформы вида «на наших машинах»: у магазина нет ни машины,
 * ни адреса, и запись о нём была бы ложью о том, где он живёт.
 *
 * `fieldset` с `legend`, а не заголовок рядом: читалке нужна именно
 * группировка.
 */
export function PlatformsCheckboxes({ platforms, value, onChange }: IProps) {
  const available = platforms.filter((platform) => platform.kind === PlatformKind.Server);

  if (available.length === 0) {
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
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Что здесь развёрнуто</legend>

      {available.map((platform) => (
        <div key={platform.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            id={`environment-platform-${platform.id}`}
            checked={value.includes(platform.id)}
            onChange={() => toggle(platform.id)}
          />
          <label htmlFor={`environment-platform-${platform.id}`} className="text-sm">
            {platform.name}
          </label>
        </div>
      ))}
    </fieldset>
  );
}
