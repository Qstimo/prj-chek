import { TRACKER_DISABLED, TRACKER_SECRET_UNDECRYPTABLE, type ProjectTracker } from '@cairn/shared';

/** Поддерживает и старый ответ API при последовательном обновлении серверов. */
export function hasProjectTrackerConnection(tracker: ProjectTracker | undefined): boolean {
  return (
    tracker?.hasConnection ??
    (tracker?.isOperational === true ||
      tracker?.blockedBy === TRACKER_DISABLED ||
      tracker?.blockedBy === TRACKER_SECRET_UNDECRYPTABLE)
  );
}
