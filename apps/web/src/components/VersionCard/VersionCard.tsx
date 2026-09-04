'use client';

import type { RoadmapVersionDetail, RoadmapVersionMetadata } from '@cairn/shared';
import { useState } from 'react';

import { CheckpointList } from '../VersionDrawer/CheckpointList';
import { STATE_LABELS } from '../VersionDrawer';
import type { IProps } from './types';

/** Версия роадмапа: паспорт, прогресс и чекпоинты по уровню (ТЗ 3.5). */
export function VersionCard({
  version,
  canWrite = false,
  onToggleCheckpoint,
  onEditVersion,
  onDeleteVersion,
  onDeleteCheckpoint,
  onAddCheckpoint,
}: IProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const detail = isDetailed(version) ? version : null;

  return (
    <article className="space-y-3 rounded-md border border-border p-4">
      <header className="flex flex-wrap items-baseline gap-3">
        <h3 className="text-lg font-medium">{version.label}</h3>
        <span className="text-sm text-muted-foreground">{STATE_LABELS[version.state]}</span>
        {version.plannedDate && (
          <span className="text-sm text-muted-foreground">
            план: {new Date(`${version.plannedDate}T00:00:00`).toLocaleDateString('ru-RU')}
          </span>
        )}
        <span className="rounded bg-muted px-2 py-0.5 text-xs">
          {version.progress.done}/{version.progress.total}
        </span>
      </header>

      {detail && (
        <CheckpointList
          checkpoints={detail.checkpoints}
          canWrite={canWrite}
          onToggle={onToggleCheckpoint}
          onDelete={onDeleteCheckpoint}
        />
      )}

      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onAddCheckpoint}
            className="rounded-md border px-3 py-1 text-sm"
          >
            Добавить чекпоинт
          </button>
          <button
            type="button"
            onClick={onEditVersion}
            className="rounded-md border px-3 py-1 text-sm"
          >
            Править версию
          </button>
          {isConfirming ? (
            <>
              <button
                type="button"
                onClick={onDeleteVersion}
                className="rounded-md bg-destructive px-3 py-1 text-sm text-destructive-foreground"
              >
                Подтвердить удаление
              </button>
              <button
                type="button"
                onClick={() => setIsConfirming(false)}
                className="rounded-md border px-3 py-1 text-sm"
              >
                Отмена
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setIsConfirming(true)}
              className="rounded-md border px-3 py-1 text-sm"
            >
              Удалить версию
            </button>
          )}
        </div>
      )}
    </article>
  );
}

/** Отличает проекцию чтения от проекции метаданных. */
function isDetailed(
  version: RoadmapVersionMetadata | RoadmapVersionDetail,
): version is RoadmapVersionDetail {
  return 'checkpoints' in version;
}
