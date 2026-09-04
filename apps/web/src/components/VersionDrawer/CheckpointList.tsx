'use client';

import type { RoadmapCheckpoint } from '@cairn/shared';

/** Пропсы списка чекпоинтов. */
interface IProps {
  checkpoints: RoadmapCheckpoint[];
  canWrite: boolean;
  onToggle: (checkpointId: string, isDone: boolean) => void;
  onDelete: (checkpointId: string) => void;
}

/**
 * Чекпоинты версии: формулировка и галочка «закрыт».
 *
 * Галочка активна только при праве записи; без него список — чтение.
 */
export function CheckpointList({ checkpoints, canWrite, onToggle, onDelete }: IProps) {
  if (checkpoints.length === 0) {
    return <p className="text-sm text-muted-foreground">Чекпоинтов пока нет.</p>;
  }

  return (
    <ul className="grid gap-1">
      {checkpoints.map((checkpoint) => (
        <li key={checkpoint.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            id={`checkpoint-${checkpoint.id}`}
            checked={checkpoint.isDone}
            disabled={!canWrite}
            onChange={(event) => onToggle(checkpoint.id, event.target.checked)}
            aria-label={checkpoint.title}
          />
          <label
            htmlFor={`checkpoint-${checkpoint.id}`}
            className={checkpoint.isDone ? 'text-muted-foreground line-through' : ''}
          >
            {checkpoint.title}
          </label>
          {canWrite && (
            <button
              type="button"
              aria-label={`Убрать ${checkpoint.title}`}
              onClick={() => onDelete(checkpoint.id)}
              className="text-sm text-muted-foreground"
            >
              ×
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
