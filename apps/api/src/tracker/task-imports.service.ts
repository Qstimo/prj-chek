import {
  MAX_PROJECT_TASK_TITLE,
  type AuditSubjectKind,
  TRACKER_UNAVAILABLE,
  type TrackerImportCandidate,
  type TrackerImportPreview,
  type TrackerImportQuery,
  type TrackerImportRequest,
  type TrackerImportResult,
} from '@cairn/shared';
import { BadGatewayException, Inject, Injectable } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { TaskExportsRepository } from './task-exports.repository';
import { TaskImportsRepository, existingImportTask } from './task-imports.repository';
import { TrackerBindingsRepository } from './tracker-bindings.repository';
import { TRACKER_SOURCE, TrackerFailure, type TrackerSource } from './tracker';
import { TrackerBindingMissingError, TrackerNotConfiguredError } from './tracker.errors';

@Injectable()
export class TaskImportsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: TaskImportsRepository,
    private readonly bindings: TrackerBindingsRepository,
    private readonly exports: TaskExportsRepository,
    private readonly audit: AuditService,
    @Inject(TRACKER_SOURCE) private readonly trackers: TrackerSource,
  ) {}

  private async source(subject: RequestSubject, projectId: string, boardId: string) {
    await this.bindings.requireWrite(subject, projectId);
    const binding = await this.bindings.findForProject(subject, projectId);
    if (!binding) throw new TrackerBindingMissingError();
    const port = await this.trackers.current();
    if (!port.isEnabled) throw new TrackerNotConfiguredError();
    const controller = new AbortController();
    try {
      return {
        tracker: port.kind,
        source: await port.readImportTasks({ ...binding, boardId }, controller.signal),
      };
    } catch (cause) {
      throw new BadGatewayException({
        code: cause instanceof TrackerFailure ? cause.code : TRACKER_UNAVAILABLE,
        message:
          cause instanceof TrackerFailure ? cause.message : 'Не удалось получить задачи Weeek.',
      });
    } finally {
      controller.abort();
    }
  }

  async preview(
    subject: RequestSubject,
    projectId: string,
    query: TrackerImportQuery,
  ): Promise<TrackerImportPreview> {
    const { source } = await this.source(subject, projectId, query.boardId);
    const known = await this.repository.known(subject, projectId);
    const tasks = source.tasks
      .filter((task) => matchesImport(task, query))
      .map((task) => ({
        ...task,
        existingTaskId: existingImportTask(known, task),
        blockedReason: importBlock(task.title),
      }));
    return { ...source, tasks };
  }

  async import(
    subject: RequestSubject,
    projectId: string,
    input: TrackerImportRequest,
  ): Promise<TrackerImportResult[]> {
    // Перечитываем Weeek: заголовок, ссылка и исполнитель никогда не принимаются от браузера.
    const { source, tracker } = await this.source(subject, projectId, input.boardId);
    const available = new Map(source.tasks.map((task) => [task.externalId, task]));
    return this.db.transaction(async (tx) => {
      await this.repository.lock(subject, tx, projectId);
      const known = await this.repository.known(subject, projectId, tx);
      const results: TrackerImportResult[] = [];
      for (const externalId of input.externalIds) {
        const task = available.get(externalId);
        if (!task) {
          results.push({
            externalId,
            taskId: null,
            outcome: 'skipped',
            reason: 'Задача больше не доступна на выбранной доске. Обновите список.',
          });
          continue;
        }
        const existing = existingImportTask(known, task);
        if (existing) {
          results.push({
            externalId,
            taskId: existing,
            outcome: 'existing',
            reason: 'Уже есть в проекте.',
          });
          continue;
        }
        const blockedReason = importBlock(task.title);
        if (blockedReason) {
          results.push({ externalId, taskId: null, outcome: 'skipped', reason: blockedReason });
          continue;
        }
        const row = await this.repository.create(subject, tx, projectId, {
          ...task,
          existingTaskId: null,
          blockedReason: null,
        });
        const state = { ...task, boardColumnId: task.boardColumnId };
        await this.exports.recordExported(subject, tx, projectId, row.id, {
          tracker,
          boardId: task.boardId,
          state,
        });
        await this.exports.recordPolled(tx, row.id, { tracker, state, code: null });
        await this.audit.record(
          tx,
          {
            id: subject.id,
            kind: subject.kind as unknown as Exclude<AuditSubjectKind, AuditSubjectKind.System>,
            label: subject.label,
          },
          {
            action: AuditAction.TaskImported,
            entityType: 'task',
            entityId: row.id,
            projectId,
            metadata: { tracker, externalId, boardId: task.boardId },
          },
        );
        known.push({
          taskId: row.id,
          url: task.externalUrl,
          externalId,
          externalUrl: task.externalUrl,
        });
        results.push({ externalId, taskId: row.id, outcome: 'created', reason: null });
      }
      return results;
    });
  }
}

export function importBlock(title: string): string | null {
  return !title
    ? 'В Weeek не указана формулировка.'
    : title.length > MAX_PROJECT_TASK_TITLE
      ? `Формулировка длиннее ${MAX_PROJECT_TASK_TITLE} символов. Сократите её в Weeek.`
      : null;
}

export function matchesImport(
  task: Pick<TrackerImportCandidate, 'title' | 'boardColumnId' | 'isCompleted' | 'details'>,
  query: TrackerImportQuery,
): boolean {
  if (query.columnId && task.boardColumnId !== query.columnId) return false;
  if (query.status !== 'all' && task.isCompleted !== (query.status === 'completed')) return false;
  if (query.assigneeId === 'unassigned' && task.details.assignees.length !== 0) return false;
  if (
    query.assigneeId &&
    query.assigneeId !== 'unassigned' &&
    !task.details.assignees.some((person) => person.id === query.assigneeId)
  )
    return false;
  if (
    query.search &&
    !task.title.toLocaleLowerCase('ru').includes(query.search.toLocaleLowerCase('ru'))
  )
    return false;
  const date = task.details[query.dateField]?.slice(0, 10);
  if ((query.dateFrom || query.dateTo) && !date) return false;
  return (!query.dateFrom || date! >= query.dateFrom) && (!query.dateTo || date! <= query.dateTo);
}
