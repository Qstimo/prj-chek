import { AccessLevel, Section, defaultTaskVersion, type TaskPlanningUpdate } from '@cairn/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { SectionNotVisibleError } from '../access/access.errors';
import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import type { Transaction } from '../db/db.types';
import {
  projects,
  projectTasks,
  roadmapCheckpoints,
  roadmapVersions,
  taskExports,
  trackerProjectBindings,
} from '../db/schema';

/** Все изменения размещения сериализуются тем же замком проекта, что роадмап. */
@Injectable()
export class TaskPlanningRepository {
  constructor(private readonly access: AccessService) {}

  async lock(subject: RequestSubject, tx: Transaction, projectId: string) {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);
    await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .for('no key update');
  }

  async resolveVersion(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    requested: string | null | undefined,
  ): Promise<string | null> {
    await this.lock(subject, tx, projectId);
    const versions = await tx
      .select()
      .from(roadmapVersions)
      .where(eq(roadmapVersions.projectId, projectId));
    if (requested === undefined) return defaultTaskVersion(versions)?.id ?? null;
    if (requested !== null && !versions.some((version) => version.id === requested))
      throw new SectionNotVisibleError();
    return requested;
  }

  async assign(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    taskId: string,
    input: TaskPlanningUpdate,
  ): Promise<void> {
    const versionId = await this.resolveVersion(subject, tx, projectId, input.versionId);
    const [task] = await tx
      .select()
      .from(projectTasks)
      .where(and(eq(projectTasks.id, taskId), eq(projectTasks.projectId, projectId)))
      .for('no key update');
    if (!task) throw new SectionNotVisibleError();
    if (input.completionRule?.columnId) {
      const [binding] = await tx
        .select()
        .from(trackerProjectBindings)
        .where(eq(trackerProjectBindings.projectId, projectId));
      const [mirror] = await tx.select().from(taskExports).where(eq(taskExports.taskId, taskId));
      if (
        !binding ||
        !mirror ||
        input.completionRule.boardId !== binding.boardId ||
        mirror.externalBoardId !== binding.boardId
      )
        throw new BadRequestException('Сначала свяжите задачу с доской Weeek этого проекта.');
    }
    if (input.completionRule !== undefined) {
      await tx
        .update(projectTasks)
        .set({ completionRule: input.completionRule, updatedAt: new Date() })
        .where(eq(projectTasks.id, taskId));
    }
    const [placed] = await tx
      .select()
      .from(roadmapCheckpoints)
      .where(eq(roadmapCheckpoints.taskId, taskId));
    if (versionId === null) {
      if (placed) await tx.delete(roadmapCheckpoints).where(eq(roadmapCheckpoints.id, placed.id));
      return;
    }
    const entries = await tx
      .select({ position: roadmapCheckpoints.position })
      .from(roadmapCheckpoints)
      .where(eq(roadmapCheckpoints.versionId, versionId));
    const position = Math.max(0, ...entries.map((entry) => entry.position)) + 1;
    if (placed) {
      await tx
        .update(roadmapCheckpoints)
        .set({
          versionId,
          isDone: input.isDone ?? placed.isDone,
          ...(placed.versionId !== versionId
            ? { position, carriedFromVersionId: placed.versionId }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(roadmapCheckpoints.id, placed.id));
    } else {
      await tx
        .insert(roadmapCheckpoints)
        .values({ taskId, versionId, position, isDone: input.isDone ?? false });
    }
  }
}
