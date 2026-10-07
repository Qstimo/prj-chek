'use client';

import { useState } from 'react';

import { CheckpointForm } from '../CheckpointForm';
import { Drawer, DrawerWidth } from '../Drawer';
import { VersionForm } from '../VersionForm';
import { CheckpointList } from './CheckpointList';
import { ReleaseList } from './ReleaseList';
import { VersionActions } from './VersionActions';
import { VersionPassport } from './VersionPassport';
import type { IProps } from './types';
import { isDetailed } from './utils';

/**
 * Панель версии роадмапа: просмотр и правка (спека, раздел 3).
 *
 * Презентационный компонент: данные и колбэки — пропами, поэтому одинаково
 * работает на внутреннем экране и на публичной странице без TanStack Query.
 */
export function VersionDrawer({
  version,
  isCurrent,
  platforms = [],
  isOpen,
  onClose,
  actions,
}: IProps) {
  const [isEditing, setIsEditing] = useState(false);
  const detail = isDetailed(version) ? version : null;

  function handleClose(): void {
    setIsEditing(false);
    onClose();
  }

  return (
    <Drawer isOpen={isOpen} onClose={handleClose} title={version.label} width={DrawerWidth.Wide}>
      {isEditing && actions ? (
        <VersionForm
          initial={{
            label: version.label,
            state: version.state,
            plannedDate: version.plannedDate,
            releasedDate: version.releasedDate,
          }}
          hasPlatforms={platforms.length > 0}
          isSubmitting={actions.isSubmittingVersion}
          error={actions.versionError}
          onSubmit={(input) => actions.onSubmitVersion(input, () => setIsEditing(false))}
          onCancel={() => setIsEditing(false)}
        />
      ) : (
        <VersionPassport version={version} isCurrent={isCurrent} />
      )}

      {detail && (
        <ReleaseList
          platforms={platforms}
          releases={detail.releases}
          onSet={actions?.onSetRelease}
          onClear={actions?.onClearRelease}
        />
      )}

      {detail && (
        <CheckpointList
          checkpoints={detail.checkpoints}
          canWrite={Boolean(actions)}
          platforms={platforms.length > 0 ? platforms : undefined}
          onToggle={(checkpointId, isDone) => actions?.onToggleCheckpoint(checkpointId, isDone)}
          onDelete={(checkpointId) => actions?.onDeleteCheckpoint(checkpointId)}
          onEdit={actions?.onEditCheckpoint}
          onReadTitle={actions?.onReadCheckpointTitle}
        />
      )}

      {actions && (
        <CheckpointForm
          platforms={platforms.length > 0 ? platforms : undefined}
          isSubmitting={actions.isSubmittingCheckpoint}
          onSubmit={actions.onAddCheckpoint}
          onReadTitle={actions.onReadCheckpointTitle}
        />
      )}

      {actions && !isEditing && (
        <VersionActions
          onEdit={() => setIsEditing(true)}
          onDelete={actions.onDeleteVersion}
        />
      )}
    </Drawer>
  );
}
