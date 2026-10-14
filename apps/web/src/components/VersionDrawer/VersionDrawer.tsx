'use client';

import { useState } from 'react';

import { CheckpointForm } from '../CheckpointForm';
import { ConfirmDialog } from '../ConfirmDialog';
import { Drawer, DrawerWidth } from '../Drawer';
import { FormError } from '../FormError';
import { VersionFields } from '../VersionFields';
import { CheckpointList } from './CheckpointList';
import { ReleaseList } from './ReleaseList';
import { SaveButton } from './SaveButton';
import { VersionActions } from './VersionActions';
import { VersionPassport } from './VersionPassport';
import {
  CHECKPOINTS_HINT,
  CHECKPOINTS_TITLE,
  CLOSE_CONFIRM_ACTION,
  CLOSE_CONFIRM_LABEL,
  UNSAVED_WARNING,
} from './constants';
import type { IProps } from './types';
import { draftOf, isDetailed, isDirtyOf, releaseOpsOf, versionPatchOf } from './utils';

/**
 * Панель версии роадмапа: черновик паспорта и выпусков, чекпоинты на месте.
 *
 * Презентационный компонент: данные и колбэки — пропами, поэтому одинаково
 * работает на внутреннем экране и на публичной странице без TanStack Query.
 *
 * Черновик берётся из версии при создании компонента, поэтому родитель
 * обязан дать панели `key` версии: без него черновик одной версии переехал
 * бы на другую. Сбрасывает его не колбэк успеха, а перечитанные данные:
 * когда ответ сервера доходит до пропа, разница обнуляется сама, и
 * обнулять её вручную значило бы на миг вернуть поля к старому значению.
 */
export function VersionDrawer({
  version,
  isCurrent,
  platforms = [],
  isOpen,
  onClose,
  actions,
}: IProps) {
  const [draft, setDraft] = useState(() => draftOf(version, platforms));
  const [isConfirmingClose, setIsConfirmingClose] = useState(false);

  const detail = isDetailed(version) ? version : null;
  const patch = versionPatchOf(version, draft, platforms.length > 0);
  const ops = releaseOpsOf(version, draft, platforms);
  const isDirty = isDirtyOf(patch, ops);
  // Предупреждение остаётся, а кнопка спит: несохранённое есть, но
  // отправлять пустое обозначение незачем — схема его не примет.
  const canSave = isDirty && draft.label.trim().length > 0;

  /** Esc, подложка и крестик идут сюда: перехват у всех трёх общий. */
  function requestClose(): void {
    if (isDirty) {
      setIsConfirmingClose(true);

      return;
    }

    onClose();
  }

  return (
    <Drawer
      isOpen={isOpen}
      onClose={requestClose}
      title={version.label}
      width={DrawerWidth.Wide}
      actions={
        actions && (
          <SaveButton
            canSave={canSave}
            isSaving={actions.isSavingVersion}
            onSave={() => actions.onSaveVersion(patch, ops)}
          />
        )
      }
    >
      {actions && isDirty && (
        <p role="status" className="text-sm text-muted-foreground">
          {UNSAVED_WARNING}
        </p>
      )}

      <FormError message={actions?.saveError} />

      {isConfirmingClose && (
        // Прилипает под шапкой: Esc нажимают и в конце панели с десятком
        // чекпоинтов, а вопрос, появившийся выше области просмотра,
        // выглядел бы как «ничего не произошло».
        <div className="sticky top-16 z-10">
          <ConfirmDialog
            label={CLOSE_CONFIRM_LABEL}
            confirmLabel={CLOSE_CONFIRM_ACTION}
            onConfirm={onClose}
            onCancel={() => setIsConfirmingClose(false)}
          >
            Изменения в версии «{version.label}» будут потеряны.
          </ConfirmDialog>
        </div>
      )}

      {actions ? (
        <VersionFields
          draft={draft}
          onChange={(fields) => setDraft({ ...draft, ...fields })}
          hasPlatforms={platforms.length > 0}
        />
      ) : (
        <VersionPassport version={version} isCurrent={isCurrent} />
      )}

      {detail && (
        <ReleaseList
          platforms={platforms}
          releases={draft.releases}
          versionLabel={version.label}
          onChange={
            actions &&
            ((platformId, cell) =>
              setDraft({ ...draft, releases: { ...draft.releases, [platformId]: cell } }))
          }
        />
      )}

      {detail && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">
            {CHECKPOINTS_TITLE}
            <span className="ml-2 font-normal text-muted-foreground">— {CHECKPOINTS_HINT}</span>
          </h3>

          <CheckpointList
            checkpoints={detail.checkpoints}
            canWrite={Boolean(actions)}
            platforms={platforms.length > 0 ? platforms : undefined}
            onToggle={(checkpointId, isDone) => actions?.onToggleCheckpoint(checkpointId, isDone)}
            onDelete={(checkpointId) => actions?.onDeleteCheckpoint(checkpointId)}
            onEdit={actions?.onEditCheckpoint}
            onReadTitle={actions?.onReadCheckpointTitle}
          />
        </section>
      )}

      {actions && (
        <CheckpointForm
          platforms={platforms.length > 0 ? platforms : undefined}
          isSubmitting={actions.isSubmittingCheckpoint}
          onSubmit={actions.onAddCheckpoint}
          onReadTitle={actions.onReadCheckpointTitle}
        />
      )}

      {actions && <VersionActions onDelete={actions.onDeleteVersion} />}
    </Drawer>
  );
}
