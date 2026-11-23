'use client';

import { TRACKER_BASE_URL_MISSING, type TrackerBinding, type TrackerTarget } from '@cairn/shared';
import { useState } from 'react';

import { describeApiError, summaryFailureOf } from '@/api';
import {
  useMutationSaveTrackerBinding,
  useQueryProjectTracker,
  useQueryTrackerTargets,
} from '@/api/hooks';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Drawer, DrawerWidth } from '@/components/Drawer';
import { Loader } from '@/components/Loader';
import { Select } from '@/components/Select';

import { BINDING_BLOCKED, BINDING_FAILURES, BINDING_TEXTS } from './constants';

/** Черновик привязки: пусто означает «не выбрано». */
interface Draft {
  externalProjectId: string;
  boardId: string;
  boardColumnId: string;
}

/**
 * Панель «Куда выгружать»: привязка проекта к доске трекера.
 *
 * Без подключения панели нет вовсе — ни кнопки, ни селектов, — и причина
 * названа словами: та же лестница, что у загрузки записи при выключенной
 * расшифровке. Выключенная кнопка здесь была бы хуже отсутствующей: за ней
 * стоит чужой API, и нажатие не узнало бы ничего, чего не знает ответ о
 * готовности.
 *
 * Списки целей (проекты, доски, колонки) приходят **через нашу ручку** и
 * только при открытой панели: токен не покидает сервер (дизайн, 9.3), а за
 * ответом стоит живой запрос в трекер с его пределом частоты.
 *
 * Идентификаторы чужой системы человеку не показываются нигде: он выбирает
 * имена, а в привязку уезжают идентификаторы. Имён привязка не хранит
 * намеренно — они живут в трекере, и вторая копия показывала бы доску,
 * переименованную месяц назад.
 */
export function TrackerBindingPanel({ projectId }: { projectId: string }) {
  const tracker = useQueryProjectTracker(projectId);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(draftOf(null));
  const [isConfirming, setIsConfirming] = useState(false);
  const targets = useQueryTrackerTargets(projectId, isOpen);
  const save = useMutationSaveTrackerBinding(projectId);

  // Пока готовность неизвестна или её не отдали, панели нет: роадмап
  // не обязан падать или мигать лоадером из-за трекера, который на этом
  // экране — дело десятое.
  if (tracker.isPending || tracker.isError || !tracker.data) {
    return null;
  }

  const { isOperational, blockedBy, binding } = tracker.data;

  // Подключения нет вовсе — о трекере не сказано ни слова: установка без
  // трекера полностью рабочая, задачи ведутся здесь, и строка «трекер не
  // подключён» на каждом экране задач была бы укором за решение, которого
  // никто не принимал. Начатую настройку (нет токена, снята галочка) —
  // наоборот, называем: её кто-то начал и ждёт, что выгрузка работает.
  if (blockedBy === TRACKER_BASE_URL_MISSING) {
    return null;
  }

  if (!isOperational) {
    return (
      <section className="space-y-1 rounded-md border border-border p-4">
        <h2 className="text-sm font-medium">{BINDING_TEXTS.heading}</h2>
        <p className="text-sm text-amber-600 dark:text-amber-500">
          {(blockedBy && BINDING_BLOCKED[blockedBy]) ?? 'Трекер задач не подключён.'}
        </p>
        <p className="text-sm text-muted-foreground">{BINDING_TEXTS.adminNote}</p>
      </section>
    );
  }

  /** Открытие набирает черновик из привязки: правят её, а не пустоту. */
  function open(): void {
    setDraft(draftOf(binding));
    setIsOpen(true);
  }

  function submit(): void {
    if (binding) {
      setIsConfirming(true);

      return;
    }

    store();
  }

  function store(): void {
    setIsConfirming(false);
    save.mutate(
      {
        externalProjectId: draft.externalProjectId,
        boardId: draft.boardId,
        boardColumnId: draft.boardColumnId,
      },
      { onSuccess: () => setIsOpen(false) },
    );
  }

  const boards = (targets.data?.boards ?? []).filter((board) =>
    belongsTo(board.projectId, draft.externalProjectId),
  );
  const columns = (targets.data?.columns ?? []).filter((column) =>
    belongsTo(column.boardId, draft.boardId),
  );
  const isComplete =
    draft.externalProjectId !== '' && draft.boardId !== '' && draft.boardColumnId !== '';
  const failure = summaryFailureOf(targets.error ?? save.error);
  const error =
    (failure.code && BINDING_FAILURES[failure.code]) ??
    (targets.isError ? BINDING_TEXTS.loadFailed : describeApiError(save.error));

  return (
    <section className="space-y-2 rounded-md border border-border p-4">
      <h2 className="text-sm font-medium">{BINDING_TEXTS.heading}</h2>

      <p className="text-sm">{binding ? BINDING_TEXTS.ready : BINDING_TEXTS.missing}</p>

      {binding && (
        <p className="text-sm text-muted-foreground">
          {BINDING_TEXTS.namesNote}
          {binding.updatedByLabel && ` Поставил ${binding.updatedByLabel}.`}
        </p>
      )}

      <button
        type="button"
        onClick={open}
        className="rounded-md border border-border px-3 py-2 text-sm"
      >
        {BINDING_TEXTS.open}
      </button>

      <Drawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={BINDING_TEXTS.title}
        width={DrawerWidth.Half}
      >
        <div className="space-y-4">
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}

          {/* Подтверждение — блоком внутри панели, а не рядом с ней:
              панель модальная, и блок снаружи Radix прячет от читалок
              вместе со всей страницей. Та же укладка, что у подтверждения
              пресета в форме узла модели. */}
          {isConfirming && (
            <ConfirmDialog
              label={BINDING_TEXTS.changeLabel}
              confirmLabel={BINDING_TEXTS.changeConfirm}
              onConfirm={store}
              onCancel={() => setIsConfirming(false)}
            >
              {BINDING_TEXTS.changeWarning}
            </ConfirmDialog>
          )}

          {targets.isPending && !targets.isError ? (
            <Loader size="page" />
          ) : (
            targets.data && (
              <>
                <TargetSelect
                  id="trackerProject"
                  label={BINDING_TEXTS.projectLabel}
                  value={draft.externalProjectId}
                  options={targets.data.projects}
                  // Смена проекта обнуляет доску и колонку: оставить их
                  // значило бы отправить в трекер привязку к доске чужого
                  // проекта — отказ, который человек увидел бы позже и в
                  // другом месте.
                  onChange={(value) =>
                    setDraft({ externalProjectId: value, boardId: '', boardColumnId: '' })
                  }
                />

                <TargetSelect
                  id="trackerBoard"
                  label={BINDING_TEXTS.boardLabel}
                  value={draft.boardId}
                  options={boards}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, boardId: value, boardColumnId: '' }))
                  }
                />

                <TargetSelect
                  id="trackerColumn"
                  label={BINDING_TEXTS.columnLabel}
                  value={draft.boardColumnId}
                  options={columns}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, boardColumnId: value }))
                  }
                />

                <button
                  type="button"
                  onClick={submit}
                  disabled={!isComplete || save.isPending}
                  className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
                >
                  {BINDING_TEXTS.save}
                </button>
              </>
            )
          )}
        </div>
      </Drawer>
    </section>
  );
}

/** Поле выбора цели: подпись снаружи, общий контрол внутри. */
function TargetSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: TrackerTarget[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <Select id={id} value={value} onChange={onChange}>
        <option value="">{BINDING_TEXTS.notChosen}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** Черновик из привязки: её нет — пустой. */
function draftOf(binding: TrackerBinding | null): Draft {
  return {
    externalProjectId: binding?.externalProjectId ?? '',
    boardId: binding?.boardId ?? '',
    boardColumnId: binding?.boardColumnId ?? '',
  };
}

/**
 * Принадлежит ли цель выбранному родителю.
 *
 * Неназванный родитель (`null`) не причина спрятать доску: чужой API может
 * его не вернуть, а спрятанную доску не выбрать вовсе — человек остался бы
 * с пустым списком и без объяснения. Поэтому такие цели видны при любом
 * выборе, а отказ на непринадлежащую пару назовёт трекер.
 */
function belongsTo(parentId: string | null, chosen: string): boolean {
  if (chosen === '') {
    return false;
  }

  return parentId === null || parentId === chosen;
}
