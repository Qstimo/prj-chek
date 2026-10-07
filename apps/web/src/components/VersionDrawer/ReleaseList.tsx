'use client';

import type { Platform, PlatformRelease, PlatformReleaseSet } from '@cairn/shared';

import { ReleaseRow } from './ReleaseRow';

/** Пропсы блока платформ. */
interface IProps {
  platforms: Platform[];
  releases: PlatformRelease[];
  onSet?: (platformId: string, input: PlatformReleaseSet) => void;
  onClear?: (platformId: string) => void;
}

/**
 * Выпуски версии по платформам.
 *
 * Два входа: список платформ проекта приходит пропом из сводки, текущие
 * значения — из `releases` версии. Платформ нет — блока нет.
 */
export function ReleaseList({ platforms, releases, onSet, onClear }: IProps) {
  if (platforms.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">Платформы</h3>

      <ul className="space-y-2">
        {platforms.map((platform) => (
          <ReleaseRow
            key={platform.id}
            platform={platform}
            release={releases.find((release) => release.platformId === platform.id)}
            onSet={onSet}
            onClear={onClear}
          />
        ))}
      </ul>
    </section>
  );
}
