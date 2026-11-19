import { ChronicleSource, SubjectKind, SummaryTaskState, SUMMARY_TASK_NOT_ACTIVE } from '@cairn/shared';
import { sql } from 'drizzle-orm';
import { expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import { ChronicleRepository } from '../chronicle/chronicle.repository';
import { chronicleEntries, projects, roadmapVersions, subjects, summaries, summaryTaskDrafts } from '../db/schema';
import { RoadmapRepository } from '../roadmap/roadmap.repository';
import { startTestDatabase } from '../../test/db-fixture';
import { SummariesRepository } from './summaries.repository';

it('миграция переносит только ранее выпущенные задачи и сохраняет необратимость релиза', async () => {
  const data = {
    subjectId: '', projectId: '', versionId: '', releasedSummaryId: '', releasedTaskId: '', draftTaskId: '',
  };
  const { appDb, rowsOf, stop } = await startTestDatabase({
    index: 46,
    seed: async (db) => {
      const [subject] = await db.insert(subjects).values({ kind: SubjectKind.User, label: 'Автор' }).returning();
      const [project] = await db.insert(projects).values({ name: 'Проект', slug: 'proekt' }).returning();
      data.subjectId = subject!.id;
      data.projectId = project!.id;
      const [version] = await db.insert(roadmapVersions)
        .values({ projectId: data.projectId, label: 'v1', position: 1 }).returning();
      data.versionId = version!.id;

      const entries = await db.insert(chronicleEntries).values(['Релиз', 'Черновик'].map((title) => ({
        projectId: data.projectId,
        createdBySubjectId: data.subjectId,
        occurredOn: '2026-11-18',
        source: ChronicleSource.Summary,
        title,
        content: title,
      }))).returning();
      const [released, draft] = await db.insert(summaries).values([
        {
          projectId: data.projectId,
          createdBySubjectId: data.subjectId,
          chronicleEntryId: entries[0]!.id,
          releasedVersionId: data.versionId,
        },
        {
          projectId: data.projectId,
          createdBySubjectId: data.subjectId,
          chronicleEntryId: entries[1]!.id,
        },
      ]).returning();
      data.releasedSummaryId = released!.id;

      // У прежней схемы ещё нет колонок состояния и версии у задачи.
      const [releasedTask] = await db.execute<{ id: string }>(sql`
        INSERT INTO summary_task_drafts (summary_id, title, position, origin)
        VALUES (${released!.id}, 'Уехала', 1, 'human')
        RETURNING id
      `);
      const [draftTask] = await db.execute<{ id: string }>(sql`
        INSERT INTO summary_task_drafts (summary_id, title, position, origin)
        VALUES (${draft!.id}, 'В работе', 1, 'human')
        RETURNING id
      `);
      data.releasedTaskId = releasedTask!.id;
      data.draftTaskId = draftTask!.id;
    },
  });

  try {
    const expected = [
      expect.objectContaining({
        id: data.releasedTaskId,
        state: SummaryTaskState.Released,
        releasedVersionId: data.versionId,
      }),
      expect.objectContaining({
        id: data.draftTaskId,
        state: SummaryTaskState.Active,
        releasedVersionId: null,
      }),
    ];
    const tasks = await rowsOf(summaryTaskDrafts);
    expect(tasks).toHaveLength(2);
    expect(tasks).toEqual(expect.arrayContaining(expected));

    const access = new AccessService(appDb);
    const repository = new SummariesRepository(
      appDb, access, new ChronicleRepository(appDb, access), new RoadmapRepository(appDb, access),
    );
    const subject = {
      id: data.subjectId, kind: SubjectKind.User, label: 'Автор', isSuperadmin: true, isRevoked: false,
    };
    for (const action of ['restore', 'removeTasks'] as const) {
      await expect(appDb.transaction((tx) => repository[action](
        subject, tx, data.projectId, data.releasedSummaryId, [data.releasedTaskId],
      ))).rejects.toMatchObject({ status: 409, response: { code: SUMMARY_TASK_NOT_ACTIVE } });
    }
    const after = await rowsOf(summaryTaskDrafts);
    expect(after).toHaveLength(tasks.length);
    expect(after).toEqual(expect.arrayContaining(tasks));
  } finally {
    await stop();
  }
});
