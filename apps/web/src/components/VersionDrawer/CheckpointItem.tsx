'use client';

import type { Platform, RoadmapCheckpoint } from '@cairn/shared';

import { PlatformChips } from '../PlatformChips';
import { UNFINISHED_MARK } from './constants';
import { carryOverActionOf } from './utils';

/** Пропсы строки чекпоинта. */
interface IProps {
  checkpoint: RoadmapCheckpoint;
  canWrite: boolean;
  /** Платформы проекта: по ним теги превращаются в имена. */
  platforms?: Platform[];
  /**
   * Помечать незакрытый чекпоинт словами.
   *
   * Только при расхождении «версия выпущена, а чекпоинт не закрыт»: в
   * открытой версии незакрытый чекпоинт — норма, и пометка у каждого
   * была бы шумом.
   */
  markUnfinished?: boolean;
  onToggle: (checkpointId: string, isDone: boolean) => void;
  onDelete: (checkpointId: string) => void;
  /** Переход к правке. Отсутствие — правка недоступна. */
  onEdit?: (checkpointId: string) => void;
  /** Перенос в другую версию. Отсутствие — переносить нечем. */
  onCarryOver?: (checkpointId: string) => void;
  /** Обозначение версии-получателя; `null` — её назовёт сервер. */
  carryOverTargetLabel?: string | null;
  /** Перенос уже идёт: второе нажатие завело бы второй запрос. */
  isCarryingOver?: boolean;
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
  markUnfinished = false,
  onToggle,
  onDelete,
  onEdit,
  onCarryOver,
  carryOverTargetLabel,
  isCarryingOver = false,
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

      {markUnfinished && !checkpoint.isDone && (
        <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-500">
          {UNFINISHED_MARK}
        </span>
      )}

      {/* Перенести можно только то, что ещё не закрыто: у закрытого
          чекпоинта переезд ничего не меняет. */}
      {canWrite && onCarryOver && !checkpoint.isDone && (
        <button
          type="button"
          aria-label={carryOverActionOf(checkpoint.title, carryOverTargetLabel)}
          disabled={isCarryingOver}
          onClick={() => onCarryOver(checkpoint.id)}
          className="text-sm text-muted-foreground hover:underline disabled:opacity-50"
        >
          {carryOverTargetLabel ? `→ ${carryOverTargetLabel}` : '→ следующая версия'}
        </button>
      )}

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
