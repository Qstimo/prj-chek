import { AuditSubjectKind, weeekTaskLinkOf, type TaskCompletionRule } from '@cairn/shared';
import { and, eq } from 'drizzle-orm';
import type { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import type { Transaction } from '../db/db.types';
import {
  projects,
  projectTasks,
  roadmapCheckpoints,
  taskExports,
  trackerProjectBindings,
} from '../db/schema';
import type { TaskExportPollTarget, TaskPollResult } from './task-exports.repository';
import type { TrackerTaskState } from './tracker';

export function completionRuleMatches(
  rule: TaskCompletionRule | null | undefined,
  state: TrackerTaskState | null,
  boardId: string,
): boolean {
  return (
    !!rule &&
    !!state &&
    rule.boardId === boardId &&
    state.boardId === boardId &&
    state.boardColumnId === rule.columnId
  );
}

/** Только успешное наблюдение и явно включённое правило могут завершить размещение. */
export async function applyTrackerCompletion(
  tx: Transaction,
  target: TaskExportPollTarget,
  result: TaskPollResult,
  audit: AuditService,
): Promise<void> {
  if (result.code !== null || result.state === null) return;
  // Порядок замков совпадает с ручными переносами и импортом: проект → задача → зеркало.
  await tx
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, target.projectId))
    .for('no key update');
  const [task] = await tx
    .select()
    .from(projectTasks)
    .where(and(eq(projectTasks.id, target.taskId), eq(projectTasks.projectId, target.projectId)))
    .for('no key update');
  if (!task || !completionRuleMatches(task.completionRule, result.state, target.boardId)) return;
  const [binding] = await tx
    .select()
    .from(trackerProjectBindings)
    .where(eq(trackerProjectBindings.projectId, target.projectId));
  const [mirror] = await tx.select().from(taskExports).where(eq(taskExports.taskId, target.taskId));
  if (
    binding?.boardId !== target.boardId ||
    binding.externalProjectId !== target.externalProjectId ||
    mirror?.externalId !== result.state.externalId ||
    mirror.externalBoardId !== target.boardId
  )
    return;
  const previousLink = weeekTaskLinkOf(mirror.externalUrl);
  const observedLink = weeekTaskLinkOf(result.state.externalUrl);
  if (previousLink && observedLink && previousLink.workspaceId !== observedLink.workspaceId) return;
  const [completed] = await tx
    .update(roadmapCheckpoints)
    .set({ isDone: true, updatedAt: new Date() })
    .where(and(eq(roadmapCheckpoints.taskId, target.taskId), eq(roadmapCheckpoints.isDone, false)))
    .returning();
  if (!completed) return;
  await audit.record(
    tx,
    { kind: AuditSubjectKind.System, id: null, label: 'Синхронизация Weeek' },
    {
      action: AuditAction.CheckpointUpdated,
      entityType: 'checkpoint',
      entityId: completed.id,
      projectId: target.projectId,
      metadata: {
        fields: ['isDone'],
        isDone: true,
        source: 'weeek_completion_rule',
        taskId: target.taskId,
        versionId: completed.versionId,
        boardId: target.boardId,
        columnId: result.state.boardColumnId,
      },
    },
  );
}
