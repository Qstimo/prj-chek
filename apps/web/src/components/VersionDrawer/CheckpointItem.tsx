'use client';

import type { RoadmapCheckpoint } from '@cairn/shared';

/** Пропсы строки чекпоинта. */
interface IProps {
  checkpoint: RoadmapCheckpoint;
  canWrite: boolean;
  onToggle: (checkpointId: string, isDone: boolean) => void;
  onDelete: (checkpointId: string) => void;
}

/**
 * Строка чекпоинта: галочка, формулировка, удаление.
 *
 * Со ссылкой формулировка становится ссылкой, и связь `label`→чекбокс
 * разрывается намеренно: иначе один клик и открывал бы задачу, и закрывал
 * чекпоинт. Читалкам остаётся `aria-label` на самом чекбоксе.
 */
export function CheckpointItem({ checkpoint, canWrite, onToggle, onDelete }: IProps) {
  const doneClassName = checkpoint.isDone ? 'text-muted-foreground line-through' : '';

  return (
    <li className="flex items-center gap-2">
      <input
        type="checkbox"
        id={`checkpoint-${checkpoint.id}`}
        checked={checkpoint.isDone}
        disabled={!canWrite}
        onChange={(event) => onToggle(checkpoint.id, event.target.checked)}
        aria-label={checkpoint.title}
      />

      {checkpoint.url ? (
        <a
          href={checkpoint.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`hover:underline ${doneClassName}`}
        >
          {checkpoint.title}
        </a>
      ) : (
        <label htmlFor={`checkpoint-${checkpoint.id}`} className={doneClassName}>
          {checkpoint.title}
        </label>
      )}

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
  );
}
