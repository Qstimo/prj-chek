import { TRACKER_UNAVAILABLE } from '@cairn/shared';

import type { TaskExportPollTarget } from './task-exports.repository';
import { TrackerFailure, type TrackerTarget } from './tracker';

export function groupsOf(targets: TaskExportPollTarget[]): TaskExportPollTarget[][] {
  const groups = new Map<string, TaskExportPollTarget[]>();

  for (const target of targets) {
    const key = JSON.stringify([target.externalProjectId, target.boardId]);
    const group = groups.get(key);

    if (group) group.push(target);
    else groups.set(key, [target]);
  }

  return [...groups.values()];
}

export function targetOf(target: TaskExportPollTarget): TrackerTarget {
  return {
    externalProjectId: target.externalProjectId,
    boardId: target.boardId,
    boardColumnId: target.boardColumnId,
  };
}

export function codeOf(cause: unknown): string {
  return cause instanceof TrackerFailure ? cause.code : TRACKER_UNAVAILABLE;
}
