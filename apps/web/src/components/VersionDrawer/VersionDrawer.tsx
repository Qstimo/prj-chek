'use client';

import Link from 'next/link';
import { useState } from 'react';

import { CheckpointForm } from '../CheckpointForm';
import { ConfirmDialog } from '../ConfirmDialog';
import { Drawer, DrawerWidth } from '../Drawer';
import { FormError } from '../FormError';
import { VersionFields } from '../VersionFields';
import { CheckpointList } from './CheckpointList';
import { LooseTaskPicker } from './LooseTaskPicker';
import { ReleaseList } from './ReleaseList';
import { SaveButton } from './SaveButton';
import { VersionActions } from './VersionActions';
import { VersionPassport } from './VersionPassport';
import {
  CARRY_OVER_CONFIRM,
  CARRY_OVER_DIALOG_LABEL,
  CARRY_OVER_EMPTY_LABEL,
  CARRY_OVER_FIELD_LABEL,
  CARRY_OVER_NEEDS_LABEL_QUESTION,
  CELL_INPUT_CLASSES,
  CHECKPOINT_FORM_LAYOUT_CLASSES,
  CHECKPOINTS_HINT,
  CHECKPOINTS_TITLE,
  CLOSE_CONFIRM_ACTION,
  CLOSE_CONFIRM_LABEL,
  REPORT_LINK_LABEL,
  UNSAVED_WARNING,
} from './constants';
import type { IProps } from './types';
import {
  draftOf,
  isDetailed,
  isDirtyOf,
  releaseOpsOf,
  unfinishedNoteOf,
  versionPatchOf,
} from './utils';

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
  looseTasks = [],
  carryOverTargetLabel,
  reportHref,
  isOpen,
  onClose,
  actions,
}: IProps) {
  const [draft, setDraft] = useState(() => draftOf(version, platforms));
  const [isConfirmingClose, setIsConfirmingClose] = useState(false);
  /**
   * Состояние переноса: чекпоинт, которому нужна новая версия, обозначение
   * для неё, отказ и признак «идёт».
   *
   * Отдельно от черновика паспорта намеренно: чекпоинты меняются сразу, и
   * перенос не имеет права будить ни кнопку «Сохранить», ни вопрос о
   * несохранённом при закрытии.
   */
  const [carryOverFor, setCarryOverFor] = useState<string | null>(null);
  const [newVersionLabel, setNewVersionLabel] = useState('');
  const [carryOverError, setCarryOverError] = useState<string | undefined>(undefined);
  const [carriedTo, setCarriedTo] = useState<{ label: string; versionCreated: boolean } | null>(
    null,
  );
  const [isCarryingOver, setIsCarryingOver] = useState(false);

  const detail = isDetailed(version) ? version : null;
  const patch = versionPatchOf(version, draft, platforms.length > 0);
  const ops = releaseOpsOf(version, draft, platforms);
  const isDirty = isDirtyOf(patch, ops);
  // Предупреждение остаётся, а кнопка спит: несохранённое есть, но
  // отправлять пустое обозначение незачем — схема его не примет.
  const canSave = isDirty && draft.label.trim().length > 0;

  /**
   * Перенос чекпоинта: сначала без обозначения, потом — с ним.
   *
   * Отказ «открытой версии нет» не ошибка, а вопрос: панель показывает
   * поле обозначения и повторяет перенос тем же путём, а не вторым.
   */
  async function carryOver(checkpointId: string, label?: string): Promise<void> {
    if (!actions?.onCarryOverCheckpoint) {
      return;
    }

    setIsCarryingOver(true);
    setCarryOverError(undefined);
    setCarriedTo(null);

    const outcome = await actions.onCarryOverCheckpoint(checkpointId, label);

    setIsCarryingOver(false);

    if (outcome.kind === 'needs-label') {
      setCarryOverFor(checkpointId);

      return;
    }

    if (outcome.kind === 'failed') {
      setCarryOverError(outcome.message);

      return;
    }

    setCarryOverFor(null);
    setNewVersionLabel('');
    setCarriedTo({ label: outcome.targetLabel, versionCreated: outcome.versionCreated });
  }

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
      width={DrawerWidth.Release}
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

      {/* Пометка, а не отказ: выпуск с незакрытыми чекпоинтами разрешён,
          и сказать надо о расхождении, а не о нарушении. */}
      {version.hasUnfinishedOnRelease && (
        <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          {unfinishedNoteOf(version.unfinished)}
        </p>
      )}

      <FormError message={actions?.saveError} />
      <FormError message={carryOverError} />

      {carriedTo && (
        <p className="text-sm text-muted-foreground">
          {carriedTo.versionCreated
            ? `Создана версия «${carriedTo.label}» — чекпоинт перенесён в неё.`
            : `Чекпоинт перенесён в «${carriedTo.label}».`}
        </p>
      )}

      {carryOverFor && (
        // Прилипает так же, как вопрос о закрытии: кнопка переноса стоит
        // в середине списка чекпоинтов, и вопрос выше области просмотра
        // выглядел бы как «ничего не произошло».
        <div className="sticky top-16 z-10">
          <ConfirmDialog
            label={CARRY_OVER_DIALOG_LABEL}
            confirmLabel={CARRY_OVER_CONFIRM}
            onConfirm={() => {
              const label = newVersionLabel.trim();

              // Пустое обозначение сервер не примет: повторять нечего.
              if (label.length === 0) {
                setCarryOverError(CARRY_OVER_EMPTY_LABEL);

                return;
              }

              void carryOver(carryOverFor, label);
            }}
            onCancel={() => {
              setCarryOverFor(null);
              setNewVersionLabel('');
            }}
          >
            {CARRY_OVER_NEEDS_LABEL_QUESTION}{' '}
            {/* Поле собрано здесь, а не общим `TextField`: тот несёт блочную
                обёртку с подписью сверху, а дети `ConfirmDialog` живут
                внутри абзаца. Вид берётся из общей константы строки
                выпуска — это тот же контрол в более тесном месте. */}
            <label htmlFor="carry-over-label" className="text-muted-foreground">
              {CARRY_OVER_FIELD_LABEL}
            </label>{' '}
            <input
              id="carry-over-label"
              type="text"
              value={newVersionLabel}
              onChange={(event) => setNewVersionLabel(event.target.value)}
              className={CELL_INPUT_CLASSES}
            />
          </ConfirmDialog>
        </div>
      )}

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

      {/* Переход в отчёт по релизу. Обычная ссылка, а не кнопка: отчёт
          копируют и рассылают, и его адрес нужен открываемым в новой
          вкладке. */}
      {reportHref && (
        <Link href={reportHref} className="text-sm text-muted-foreground hover:underline">
          {REPORT_LINK_LABEL}
        </Link>
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
        <section className={`space-y-2 ${CHECKPOINT_FORM_LAYOUT_CLASSES}`}>
          <h3 className="text-sm font-medium">
            {CHECKPOINTS_TITLE}
            {/* Напоминание — только тем, кто правит: на публичной странице
                менять нечего, и «меняются сразу» было бы ложью. */}
            {actions && (
              <span className="ml-2 font-normal text-muted-foreground">— {CHECKPOINTS_HINT}</span>
            )}
          </h3>

          <CheckpointList
            checkpoints={detail.checkpoints}
            canWrite={Boolean(actions)}
            platforms={platforms.length > 0 ? platforms : undefined}
            markUnfinished={version.hasUnfinishedOnRelease}
            onToggle={(checkpointId, isDone) => actions?.onToggleCheckpoint(checkpointId, isDone)}
            onDelete={(checkpointId) => actions?.onDeleteCheckpoint(checkpointId)}
            onEdit={actions?.onEditCheckpoint}
            onReadTitle={actions?.onReadCheckpointTitle}
            onCarryOver={
              actions?.onCarryOverCheckpoint && ((checkpointId) => void carryOver(checkpointId))
            }
            carryOverTargetLabel={carryOverTargetLabel}
            isCarryingOver={isCarryingOver}
          />
        </section>
      )}

      {actions && (
        <div className={`space-y-3 ${CHECKPOINT_FORM_LAYOUT_CLASSES}`}>
          {/*
            Взять существующую задачу — **первое** из двух, и не случайно:
            задача, уже лежащая в реестре вне версий, это то, о чём решение
            уже принято, а заведение новой — следующий шаг. Выбора нет
            вовсе, когда брать нечего: пустой селект обещал бы наличие.
          */}
          {looseTasks.length > 0 && (
            <LooseTaskPicker
              tasks={looseTasks}
              isSubmitting={actions.isSubmittingCheckpoint}
              onPick={(taskId) => actions.onAddCheckpoint({ taskId })}
            />
          )}

          <CheckpointForm
            platforms={platforms.length > 0 ? platforms : undefined}
            isSubmitting={actions.isSubmittingCheckpoint}
            onSubmit={actions.onAddCheckpoint}
            onReadTitle={actions.onReadCheckpointTitle}
          />
        </div>
      )}

      {actions && <VersionActions onDelete={actions.onDeleteVersion} />}
    </Drawer>
  );
}
