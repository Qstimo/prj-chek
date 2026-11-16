'use client';

import type { Platform, RoadmapCheckpoint, RoadmapCheckpointCreate } from '@cairn/shared';
import { useState } from 'react';

import { CheckpointForm } from '../CheckpointForm';
import { CheckpointItem } from './CheckpointItem';

/** Пропсы списка чекпоинтов. */
interface IProps {
  checkpoints: RoadmapCheckpoint[];
  canWrite: boolean;
  /** Платформы проекта: теги в строке и переключатели в правке. */
  platforms?: Platform[];
  /** Помечать незакрытые: версия выпущена, а они остались. */
  markUnfinished?: boolean;
  onToggle: (checkpointId: string, isDone: boolean) => void;
  onDelete: (checkpointId: string) => void;
  /** Сохранение правки. Отсутствие — правка недоступна. */
  onEdit?: (checkpointId: string, input: RoadmapCheckpointCreate) => void;
  /** Чтение заголовка задачи по ссылке. */
  onReadTitle?: (url: string) => Promise<string | null>;
  /** Перенос в другую версию. Отсутствие — переносить нечем. */
  onCarryOver?: (checkpointId: string) => void;
  /** Обозначение версии-получателя; `null` — её назовёт сервер. */
  carryOverTargetLabel?: string | null;
  /** Перенос уже идёт: кнопки спят до ответа. */
  isCarryingOver?: boolean;
}

/**
 * Чекпоинты версии: формулировка, галочка «закрыт», теги и правка.
 *
 * Правимый чекпоинт заменяется формой на своём месте. До этой работы
 * у существующего чекпоинта нельзя было поправить ни формулировку,
 * ни ссылку — только закрыть или удалить.
 */
export function CheckpointList({
  checkpoints,
  canWrite,
  platforms,
  markUnfinished = false,
  onToggle,
  onDelete,
  onEdit,
  onReadTitle,
  onCarryOver,
  carryOverTargetLabel,
  isCarryingOver = false,
}: IProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (checkpoints.length === 0) {
    return <p className="text-sm text-muted-foreground">Чекпоинтов пока нет.</p>;
  }

  return (
    <ul className="grid gap-1">
      {checkpoints.map((checkpoint) =>
        checkpoint.id === editingId && onEdit ? (
          <li key={checkpoint.id}>
            <CheckpointForm
              initial={{
                title: checkpoint.title,
                url: checkpoint.url ?? null,
                platformIds: checkpoint.platformIds,
              }}
              submitLabel="Сохранить"
              platforms={platforms}
              onReadTitle={onReadTitle}
              idPrefix={`checkpoint-${checkpoint.id}`}
              onCancel={() => setEditingId(null)}
              onSubmit={(input) => {
                onEdit(checkpoint.id, input);
                setEditingId(null);
              }}
            />
          </li>
        ) : (
          <CheckpointItem
            key={checkpoint.id}
            checkpoint={checkpoint}
            canWrite={canWrite}
            platforms={platforms}
            markUnfinished={markUnfinished}
            onToggle={onToggle}
            onDelete={onDelete}
            onEdit={onEdit && setEditingId}
            onCarryOver={onCarryOver}
            carryOverTargetLabel={carryOverTargetLabel}
            isCarryingOver={isCarryingOver}
          />
        ),
      )}
    </ul>
  );
}
