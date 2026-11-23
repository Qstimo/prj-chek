'use client';

import { TrackerKind, type TrackerConnectionUpdate, type TrackerProbeResult } from '@cairn/shared';
import { useState } from 'react';

import { describeApiError, summaryFailureOf } from '@/api';
import {
  useMutationClearTrackerConnection,
  useMutationProbeTracker,
  useMutationSaveTrackerConnection,
  useQueryTrackerConnection,
} from '@/api/hooks';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Drawer, DrawerWidth } from '@/components/Drawer';
import { Loader } from '@/components/Loader';
import { TrackerConnectionCard, TrackerProbeOutcome } from '@/components/TrackerConnectionCard';
import { TrackerConnectionForm } from '@/components/TrackerConnectionForm';

import { TRACKER_FAILURES, TRACKER_REMOVE_WARNING } from './constants';

/**
 * Блок настройки трекера задач на экране настроек.
 *
 * Свой компонент рядом с узлами модели, а не ещё одна карточка в их списке:
 * перечни разные (`TrackerKind` против `ModelServiceKind`), ручки разные, и
 * включение трекера не говорит ничего о разбивке саммари. Общим у них
 * остаётся только идиома экрана — карточка, панель правки, проверка связи.
 *
 * Исход проверки живёт в состоянии экрана, а не в кэше запросов: он нужен
 * человеку рядом с карточкой, пока он правит поле, и исчезает со следующей
 * проверкой или сохранением.
 *
 * Трекер на установку один (дизайн, 10.1), поэтому вид назван здесь
 * буквально: перечень существует с первого дня, а экран со списком из
 * одного элемента притворялся бы выбором.
 */
export function TrackerScreen() {
  const kind = TrackerKind.Weeek;
  const connection = useQueryTrackerConnection(kind);
  const save = useMutationSaveTrackerConnection(kind);
  const clear = useMutationClearTrackerConnection(kind);
  const probe = useMutationProbeTracker(kind);
  const [isEditing, setIsEditing] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [probeResult, setProbeResult] = useState<TrackerProbeResult | undefined>(undefined);

  if (connection.isPending) {
    return <Loader size="page" />;
  }

  if (connection.isError || !connection.data) {
    return (
      <p role="alert" className="text-destructive">
        Не удалось загрузить подключение трекера.
      </p>
    );
  }

  async function runProbe(): Promise<void> {
    setProbeResult(await probe.mutateAsync());
  }

  async function runSave(input: TrackerConnectionUpdate): Promise<void> {
    await save.mutateAsync(input);
    // Исход прежней проверки снимается: он относился к прежней настройке.
    setProbeResult(undefined);
    setIsEditing(false);
  }

  const cause = save.error ?? clear.error ?? probe.error;
  const failure = summaryFailureOf(cause);
  const error = (failure.code && TRACKER_FAILURES[failure.code]) ?? describeApiError(cause);

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}

      <TrackerConnectionCard
        connection={connection.data}
        onEdit={() => setIsEditing(true)}
        onProbe={() => void runProbe()}
        onRemove={() => setIsRemoving(true)}
        isProbing={probe.isPending}
        probe={probeResult && <TrackerProbeOutcome result={probeResult} />}
      />

      {isRemoving && (
        <ConfirmDialog
          label="Снятие подключения трекера"
          confirmLabel="Да, убрать"
          onConfirm={() => {
            void clear.mutateAsync();
            setIsRemoving(false);
          }}
          onCancel={() => setIsRemoving(false)}
        >
          {TRACKER_REMOVE_WARNING}
        </ConfirmDialog>
      )}

      <Drawer
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        title="Подключение трекера"
        width={DrawerWidth.Half}
      >
        <TrackerConnectionForm
          connection={connection.data}
          onSave={(input) => void runSave(input)}
          onClose={() => setIsEditing(false)}
          isSubmitting={save.isPending}
        />
      </Drawer>
    </div>
  );
}
