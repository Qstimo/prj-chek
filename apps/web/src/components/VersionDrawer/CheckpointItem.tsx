'use client';

import type { Platform, RoadmapCheckpoint } from '@cairn/shared';

import { useUnfinishedNotice } from '../RoadmapTimeline/useUnfinishedNotice';

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
  const { noticeId, isVisible, triggerProps, tooltipProps } = useUnfinishedNotice(
    markUnfinished && !checkpoint.isDone,
  );
  const explanation =
    'Версия выпущена, но чекпоинт не закрыт. Незавершённые задачи можно перенести в следующую версию.';
  const doneClassName = checkpoint.isDone ? 'text-muted-foreground line-through' : '';
  // Неизвестный идентификатор пропускается молча: платформу могли
  // удалить, а закэшированный ответ ещё помнит тег.
  const tags = checkpoint.platformIds
    .map((platformId) => platforms.find((platform) => platform.id === platformId))
    .filter((platform): platform is Platform => platform !== undefined);

  return (
    <li className="flex min-w-0 flex-wrap items-start gap-2 py-2">
      <input
        className="mt-1 shrink-0"
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
          className={`min-w-0 flex-1 basis-40 break-words [overflow-wrap:anywhere] hover:underline ${doneClassName}`}
        >
          {checkpoint.title}
        </a>
      ) : (
        <label
          htmlFor={`checkpoint-${checkpoint.id}`}
          className={`min-w-0 flex-1 basis-40 break-words [overflow-wrap:anywhere] ${doneClassName}`}
        >
          {checkpoint.title}
        </label>
      )}

      {tags.length > 0 && (
        <ul className="flex max-w-full min-w-0 flex-wrap gap-1 sm:max-w-36">
          {tags.map((tag) => (
            <li
              key={tag.id}
              tabIndex={0}
              title={tag.name}
              className="w-32 max-w-full shrink-0 truncate rounded bg-muted px-2 py-1 text-xs focus:whitespace-normal focus:break-words focus:[overflow-wrap:anywhere]"
            >
              {tag.name}
            </li>
          ))}
        </ul>
      )}

      {markUnfinished && !checkpoint.isDone && (
        <span
          {...triggerProps}
          tabIndex={0}
          aria-label="Не закрыт после выпуска"
          aria-describedby={noticeId}
          className="group shrink-0 rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600 outline-offset-2 dark:text-amber-500"
        >
          <span aria-hidden="true" className="font-bold">! </span>
          {UNFINISHED_MARK}
          <span
            id={noticeId}
            role="tooltip"
            hidden={!isVisible}
            {...tooltipProps}
            className="fixed bottom-4 left-4 right-4 z-[60] mx-auto w-fit max-w-[calc(100vw-2rem)] whitespace-normal break-words rounded-md border bg-background p-3 text-left text-sm font-normal text-foreground shadow-lg"
          >
            {explanation}
          </span>
        </span>
      )}

      {/* Перенести можно только то, что ещё не закрыто: у закрытого
          чекпоинта переезд ничего не меняет. */}
      {canWrite && onCarryOver && !checkpoint.isDone && (
        <button
          type="button"
          aria-label={carryOverActionOf(checkpoint.title, carryOverTargetLabel)}
          title={carryOverActionOf(checkpoint.title, carryOverTargetLabel)}
          disabled={isCarryingOver}
          onClick={() => onCarryOver(checkpoint.id)}
          className="h-9 w-36 max-w-full shrink-0 truncate rounded-md border px-2 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          {carryOverTargetLabel ? `→ ${carryOverTargetLabel}` : '→ следующая версия'}
        </button>
      )}

      {canWrite && onEdit && (
        <button
          type="button"
          aria-label={`Править ${checkpoint.title}`}
          onClick={() => onEdit(checkpoint.id)}
          className="h-9 w-9 shrink-0 rounded-md border text-sm text-muted-foreground"
        >
          ✎
        </button>
      )}

      {canWrite && (
        <button
          type="button"
          aria-label={`Убрать ${checkpoint.title}`}
          onClick={() => onDelete(checkpoint.id)}
          className="h-9 w-9 shrink-0 rounded-md border text-sm text-muted-foreground"
        >
          ×
        </button>
      )}
    </li>
  );
}
