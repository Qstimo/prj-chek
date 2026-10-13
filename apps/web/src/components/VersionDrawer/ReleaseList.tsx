'use client';

import type { Platform } from '@cairn/shared';

import { ReleaseRow } from './ReleaseRow';
import type { IReleaseCell } from './types';

/** Пропсы блока платформ. */
interface IProps {
  platforms: Platform[];
  /** Клетки черновика: платформа → выпуск либо `null` («как у версии»). */
  releases: Record<string, IReleaseCell | null>;
  /** Обозначение версии: подсказка для пустого обозначения сборки. */
  versionLabel: string;
  onChange?: (platformId: string, cell: IReleaseCell | null) => void;
}

/**
 * Выпуски версии по платформам.
 *
 * Два входа: список платформ проекта приходит пропом из сводки, значения —
 * из черновика панели. Платформ нет — блока нет.
 */
export function ReleaseList({ platforms, releases, versionLabel, onChange }: IProps) {
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
            cell={releases[platform.id] ?? null}
            versionLabel={versionLabel}
            onChange={onChange}
          />
        ))}
      </ul>
    </section>
  );
}
