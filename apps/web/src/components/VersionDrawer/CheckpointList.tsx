'use client';

import type { RoadmapCheckpoint } from '@cairn/shared';

import { CheckpointItem } from './CheckpointItem';

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
        <CheckpointItem
          key={checkpoint.id}
          checkpoint={checkpoint}
          canWrite={canWrite}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}
