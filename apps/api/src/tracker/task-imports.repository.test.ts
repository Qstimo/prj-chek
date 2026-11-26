import { RoadmapVersionState, SubjectKind, TaskOrigin, TrackerKind } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import type { Database } from '../db/db.types';
import {
  auditLog,
  projects,
  projectTasks,
  roadmapCheckpoints,
  roadmapVersions,
  subjects,
  taskExports,
  trackerProjectBindings,
} from '../db/schema';
import { TaskExportsRepository } from './task-exports.repository';
import { TaskImportsRepository } from './task-imports.repository';
import { TaskPlanningRepository } from '../tasks/task-planning.repository';
import { TaskImportsService } from './task-imports.service';
import { TrackerBindingsRepository } from './tracker-bindings.repository';
import type { Tracker, TrackerSource } from './tracker';

describe('импорт задач: миграция, атомарность и параллельная запись', () => {
  let fixture: TestDatabase;
  let projectId: string;
  let subject: {
    id: string;
    kind: SubjectKind.User;
    label: string;
    isSuperadmin: boolean;
    isRevoked: boolean;
  };
  const candidate = {
    externalId: '42',
    title: 'Оплата',
    externalUrl: 'https://app.weeek.net/ws/4242/task/42',
    boardId: '12',
    boardColumnId: '32',
    isCompleted: false,
    details: {
      projectId: '7',
      assignees: [{ id: 'u1', name: 'Иван' }],
      author: null,
      dueAt: '2026-11-25',
      startAt: null,
      createdAt: '2026-11-01',
      completedAt: null,
    },
  };
  const source: TrackerSource = {
    current: async () =>
      ({
        kind: TrackerKind.Weeek,
        isEnabled: true,
        readImportTasks: async () => ({
          tasks: [candidate],
          people: [],
          peopleAvailable: true,
          truncated: false,
        }),
      }) as unknown as Tracker,
  };

  beforeAll(async () => {
    fixture = await startTestDatabase();
  });
  afterAll(async () => {
    await fixture?.stop();
  });
  beforeEach(async () => {
    await fixture.truncate();
    const [person] = await fixture.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'Админ' })
      .returning();
    subject = {
      id: person!.id,
      kind: SubjectKind.User,
      label: 'Админ',
      isSuperadmin: true,
      isRevoked: false,
    };
    const [project] = await fixture.db
      .insert(projects)
      .values({ slug: 'import', name: 'Импорт' })
      .returning();
    projectId = project!.id;
    await fixture.db.insert(trackerProjectBindings).values({
      projectId,
      tracker: TrackerKind.Weeek,
      externalProjectId: '7',
      boardId: '12',
      boardColumnId: '31',
      updatedBySubjectId: subject.id,
    });
  });

  function service(db: Database, audit = new AuditService(), repo?: TaskImportsRepository) {
    const access = new AccessService(db);
    return new TaskImportsService(
      db,
      repo ?? new TaskImportsRepository(db, access),
      new TrackerBindingsRepository(db, access),
      new TaskExportsRepository(db, access),
      audit,
      source,
      new TaskPlanningRepository(access),
    );
  }

  it('роль приложения создаёт задачу, метаданные и журнал одной операцией', async () => {
    await service(fixture.appDb).import(subject, projectId, { boardId: '12', externalIds: ['42'] });
    const [task] = await fixture.rowsOf(projectTasks);
    const [mirror] = await fixture.rowsOf(taskExports);
    const [entry] = await fixture.rowsOf(auditLog);
    expect(task?.origin).toBe(TaskOrigin.Tracker);
    expect(task?.url).toBe(candidate.externalUrl);
    expect(mirror?.details?.assignees[0]?.name).toBe('Иван');
    expect(mirror?.checkedAt).not.toBeNull();
    expect(entry?.action).toBe('task.imported');
    const poll = await new TaskExportsRepository(
      fixture.db,
      new AccessService(fixture.db),
    ).listForPoll(10);
    expect(poll[0]?.boardId).toBe('12');
  });
  it('импорт по умолчанию размещает задачу в ближайшем разрабатываемом релизе', async () => {
    const versions = await fixture.db
      .insert(roadmapVersions)
      .values([
        {
          projectId,
          label: 'later',
          position: 1,
          state: RoadmapVersionState.InProgress,
          plannedDate: '2026-12-10',
        },
        {
          projectId,
          label: 'nearest',
          position: 2,
          state: RoadmapVersionState.InProgress,
          plannedDate: '2026-11-30',
        },
      ])
      .returning();
    await service(fixture.appDb).import(subject, projectId, { boardId: '12', externalIds: ['42'] });
    const [placement] = await fixture.rowsOf(roadmapCheckpoints);
    expect(placement?.versionId).toBe(versions[1]?.id);
    expect(placement?.isDone).toBe(false);
  });
  it('явный выбор вне релиза побеждает автоматически выбранный', async () => {
    await fixture.db
      .insert(roadmapVersions)
      .values({ projectId, label: 'active', position: 1, state: RoadmapVersionState.InProgress });
    await service(fixture.appDb).import(subject, projectId, {
      boardId: '12',
      externalIds: ['42'],
      versionId: null,
    });
    expect(await fixture.rowsOf(roadmapCheckpoints)).toHaveLength(0);
  });
  it('роль приложения сохраняет правило и переносит задачу, чужой релиз откатывает правку', async () => {
    await service(fixture.appDb).import(subject, projectId, {
      boardId: '12',
      externalIds: ['42'],
      versionId: null,
    });
    const [task] = await fixture.rowsOf(projectTasks);
    const [version] = await fixture.db
      .insert(roadmapVersions)
      .values({ projectId, label: 'active', position: 1 })
      .returning();
    const planning = new TaskPlanningRepository(new AccessService(fixture.appDb));
    await fixture.appDb.transaction((tx) =>
      planning.assign(subject, tx, projectId, task!.id, {
        versionId: version!.id,
        completionRule: { boardId: '12', columnId: '32' },
      }),
    );
    expect((await fixture.rowsOf(projectTasks))[0]?.completionRule).toEqual({
      boardId: '12',
      columnId: '32',
    });
    expect((await fixture.rowsOf(roadmapCheckpoints))[0]?.versionId).toBe(version!.id);
    await expect(
      fixture.appDb.transaction((tx) =>
        planning.assign(subject, tx, projectId, task!.id, {
          versionId: '11111111-1111-4111-8111-111111111111',
          completionRule: null,
        }),
      ),
    ).rejects.toThrow();
    expect((await fixture.rowsOf(projectTasks))[0]?.completionRule).not.toBeNull();
  });

  it('отказ журнала откатывает и задачу, и связь', async () => {
    const audit = {
      record: vi.fn().mockRejectedValue(new Error('Журнал недоступен')),
    } as unknown as AuditService;
    await expect(
      service(fixture.appDb, audit).import(subject, projectId, {
        boardId: '12',
        externalIds: ['42'],
      }),
    ).rejects.toThrow();
    expect(await fixture.rowsOf(projectTasks)).toHaveLength(0);
    expect(await fixture.rowsOf(taskExports)).toHaveLength(0);
  });

  it('две отдельные сессии импорта создают одну задачу', async () => {
    const dbA = fixture.pool();
    const dbB = fixture.pool();
    const repo = new TaskImportsRepository(dbA, new AccessService(dbA));
    const create = repo.create.bind(repo);
    vi.spyOn(repo, 'create').mockImplementation(async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return create(...args);
    });
    const results = await Promise.all([
      service(dbA, new AuditService(), repo).import(subject, projectId, {
        boardId: '12',
        externalIds: ['42'],
      }),
      service(dbB).import(subject, projectId, { boardId: '12', externalIds: ['42'] }),
    ]);
    expect(
      results
        .flat()
        .map((row) => row.outcome)
        .sort(),
    ).toEqual(['created', 'existing']);
    expect(await fixture.rowsOf(projectTasks)).toHaveLength(1);
    expect(await fixture.rowsOf(taskExports)).toHaveLength(1);
  });
});
