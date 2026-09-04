'use client';

import { useState } from 'react';

import { CheckpointForm } from '../CheckpointForm';
import { Drawer } from '../Drawer';
import { VersionForm } from '../VersionForm';
import { CheckpointList } from './CheckpointList';
import { DeleteVersionButton } from './DeleteVersionButton';
import { VersionPassport } from './VersionPassport';
import type { IProps } from './types';
import { isDetailed } from './utils';

/**
 * Панель версии роадмапа: просмотр и правка (спека, раздел 3).
 *
 * Презентационный компонент: данные и колбэки — пропами, поэтому одинаково
 * работает на внутреннем экране и на публичной странице без TanStack Query.
 */
export function VersionDrawer({ version, isCurrent, isOpen, onClose, actions }: IProps) {
  const [isEditing, setIsEditing] = useState(false);
  const detail = isDetailed(version) ? version : null;

  function handleClose(): void {
    setIsEditing(false);
    onClose();
  }

  return (
    <Drawer isOpen={isOpen} onClose={handleClose} title={version.label}>
      {isEditing && actions ? (
        <VersionForm
          initial={{
            label: version.label,
            state: version.state,
            plannedDate: version.plannedDate,
            releasedDate: version.releasedDate,
          }}
          isSubmitting={actions.isSubmittingVersion}
          error={actions.versionError}
          onSubmit={(input) => actions.onSubmitVersion(input, () => setIsEditing(false))}
        />
      ) : (
        <VersionPassport version={version} isCurrent={isCurrent} />
      )}

      {isEditing && actions && (
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          className="rounded-md border px-3 py-1 text-sm"
        >
          Отмена
        </button>
      )}

      {detail && (
        <CheckpointList
          checkpoints={detail.checkpoints}
          canWrite={Boolean(actions)}
          onToggle={(checkpointId, isDone) => actions?.onToggleCheckpoint(checkpointId, isDone)}
          onDelete={(checkpointId) => actions?.onDeleteCheckpoint(checkpointId)}
        />
      )}

      {actions && (
        <CheckpointForm
          isSubmitting={actions.isSubmittingCheckpoint}
          onSubmit={actions.onAddCheckpoint}
        />
      )}

      {actions && !isEditing && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="rounded-md border px-3 py-1 text-sm"
          >
            Редактировать
          </button>
          <DeleteVersionButton onDelete={actions.onDeleteVersion} />
        </div>
      )}
    </Drawer>
  );
}
