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
  onToggle: (checkpointId: string, isDone: boolean) => void;
  onDelete: (checkpointId: string) => void;
  /** Сохранение правки. Отсутствие — правка недоступна. */
  onEdit?: (checkpointId: string, input: RoadmapCheckpointCreate) => void;
  /** Чтение заголовка задачи по ссылке. */
  onReadTitle?: (url: string) => Promise<string | null>;
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
  onToggle,
  onDelete,
  onEdit,
  onReadTitle,
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
            onToggle={onToggle}
            onDelete={onDelete}
            onEdit={onEdit && setEditingId}
          />
        ),
      )}
    </ul>
  );
}
