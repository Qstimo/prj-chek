'use client';

import type { PlatformCreate } from '@cairn/shared';

import { PLATFORM_PRESETS } from './constants';

/** Пропсы подсказок платформ. */
interface IProps {
  /** Уже заведённые имена: их подсказки не показываются. */
  taken: string[];
  onPick: (input: PlatformCreate) => void;
}

/**
 * Полупрозрачные подсказки частых платформ.
 *
 * Клик превращает подсказку в платформу; уже заведённое из списка
 * пропадает, чтобы не предлагать дважды.
 */
export function PlatformSuggestions({ taken, onPick }: IProps) {
  const available = PLATFORM_PRESETS.filter((preset) => !taken.includes(preset.name));

  if (available.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {available.map((preset) => (
        <button
          key={preset.name}
          type="button"
          onClick={() => onPick(preset)}
          className="rounded border border-dashed px-2 py-1 text-sm text-muted-foreground opacity-70"
        >
          {`+ ${preset.name}`}
        </button>
      ))}
    </div>
  );
}
