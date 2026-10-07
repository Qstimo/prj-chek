'use client';

import type { Platform, RoadmapCheckpoint } from '@cairn/shared';

import { PlatformChips } from '../PlatformChips';

/** Пропсы строки чекпоинта. */
interface IProps {
  checkpoint: RoadmapCheckpoint;
  canWrite: boolean;
  /** Платформы проекта: по ним теги превращаются в имена. */
  platforms?: Platform[];
  onToggle: (checkpointId: string, isDone: boolean) => void;
  onDelete: (checkpointId: string) => void;
  /** Переход к правке. Отсутствие — правка недоступна. */
  onEdit?: (checkpointId: string) => void;
}

/**
 * Строка чекпоинта: галочка, формулировка, удаление.
 *
 * Со ссылкой формулировка становится ссылкой, и связь `label`→чекбокс
 * разрывается намеренно: иначе один клик и открывал бы задачу, и закрывал
 * чекпоинт. Читалкам остаётся `aria-label` на самом чекбоксе.
 */
export function CheckpointItem({
  checkpoint,
  canWrite,
  platforms = [],
  onToggle,
  onDelete,
  onEdit,
}: IProps) {
  const doneClassName = checkpoint.isDone ? 'text-muted-foreground line-through' : '';
  // Неизвестный идентификатор пропускается молча: платформу могли
  // удалить, а закэшированный ответ ещё помнит тег.
  const tags = checkpoint.platformIds
    .map((platformId) => platforms.find((platform) => platform.id === platformId))
    .filter((platform): platform is Platform => platform !== undefined);

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

      <PlatformChips platforms={tags} />

      {canWrite && onEdit && (
        <button
          type="button"
          aria-label={`Править ${checkpoint.title}`}
          onClick={() => onEdit(checkpoint.id)}
          className="text-sm text-muted-foreground"
        >
          ✎
        </button>
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
