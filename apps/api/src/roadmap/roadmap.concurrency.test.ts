import { SubjectKind } from '@cairn/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';
import { SectionNotVisibleError } from '../access/access.errors';
import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import type { Database, Transaction } from '../db/db.types';
import { auditLog, projects, roadmapCheckpoints, subjects } from '../db/schema';
import { RoadmapRepository } from './roadmap.repository';
import { RoadmapService } from './roadmap.service';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('concurrent roadmap writers on separate connections', () => {
  let database: TestDatabase;
  let first: RoadmapService;
  let second: RoadmapService;
  let actor: RequestSubject;
  let projectId: string;

  function service(db: Database, audit = new AuditService()) {
    return new RoadmapService(db, new RoadmapRepository(db, new AccessService(db)), audit);
  }

  beforeAll(async () => { database = await startTestDatabase(); });
  afterAll(async () => { await database?.stop(); });
  beforeEach(async () => {
    await database.truncate();
    const [subject] = await database.db.insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin' }).returning();
    actor = { id: subject!.id, kind: SubjectKind.User, label: 'admin',
      isSuperadmin: true, isRevoked: false };
    const [project] = await database.db.insert(projects)
      .values({ slug: 'concurrent', name: 'Concurrent' }).returning();
    projectId = project!.id;
    // The fixture has two independent max:1 pools: these transactions
    // cannot accidentally queue behind the same client connection.
    first = service(database.db);
    second = service(database.appDb);
  });

  /** Pause immediately before the first move's audit/commit. */
  function holdMove(source: string, checkpoint: string, input: { targetVersionId: string } | { newVersionLabel: string }) {
    const reached = deferred<Transaction>();
    const release = deferred<void>();
    const audit = new AuditService();
    const record = audit.record.bind(audit);
    vi.spyOn(audit, 'record').mockImplementation(async (tx, subject, entry) => {
      reached.resolve(tx);
      await release.promise;
      await record(tx, subject, entry);
    });
    const moving = service(database.db, audit)
      .carryOverCheckpoint(actor, projectId, source, checkpoint, input);
    return { reached: reached.promise, release: () => release.resolve(), moving };
  }

  /** Verify the competing transaction actually reached its blocking SQL. */
  async function waitForBlockedWriter(tx: Transaction) {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      // The second pool may only connect after the first snapshot was
      // read; do not retain pg_stat_activity's transaction-local cache.
      await tx.execute(sql`select pg_stat_clear_snapshot()`);
      const rows = await tx.execute(sql`
        select pid from pg_stat_activity
        where pg_backend_pid() = any(pg_blocking_pids(pid))
      `);
      if (rows.length > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Competing writer never reached the database lock');
  }

  async function setup() {
    const source = await first.createVersion(actor, projectId, { label: 'v1' });
    const target = await first.createVersion(actor, projectId, { label: 'v2' });
    const alternate = await first.createVersion(actor, projectId, { label: 'v3' });
    const checkpoint = await first.createCheckpoint(actor, projectId, source.id, { title: 'Move me' });
    return { source, target, alternate, checkpoint };
  }

  it('rejects a stale competing move without auditing or overwriting the first move', async () => {
    const { source, target, alternate, checkpoint } = await setup();
    const held = holdMove(source.id, checkpoint.id, { targetVersionId: target.id });
    const tx = await held.reached;
    const competing = second.carryOverCheckpoint(actor, projectId, source.id, checkpoint.id,
      { targetVersionId: alternate.id });
    const completed = Promise.allSettled([held.moving, competing]);
    try { await waitForBlockedWriter(tx); } finally { held.release(); await completed; }
    const [winner, loser] = await completed;
    expect(winner.status).toBe('fulfilled');
    expect(loser).toMatchObject({ status: 'rejected', reason: expect.any(SectionNotVisibleError) });
    const [row] = await database.db.select().from(roadmapCheckpoints)
      .where(eq(roadmapCheckpoints.id, checkpoint.id));
    expect(row?.versionId).toBe(target.id);
    const entries = await database.db.select().from(auditLog)
      .where(eq(auditLog.action, AuditAction.CheckpointCarriedOver));
    expect(entries).toHaveLength(1);
    expect(entries[0]?.metadata).toMatchObject({ from: 'v1', to: 'v2' });
  });

  it.each(['carry-over', 'create'] as const)('allocates consecutive positions against concurrent %s', async (operation) => {
    const { source, target, checkpoint } = await setup();
    const other = await first.createCheckpoint(actor, projectId, source.id, { title: 'Other' });
    const held = holdMove(source.id, checkpoint.id, { targetVersionId: target.id });
    const tx = await held.reached;
    const competing = operation === 'carry-over'
      ? second.carryOverCheckpoint(actor, projectId, source.id, other.id, { targetVersionId: target.id })
      : second.createCheckpoint(actor, projectId, target.id, { title: 'New' });
    const completed = Promise.allSettled([held.moving, competing]);
    try { await waitForBlockedWriter(tx); } finally { held.release(); await completed; }
    expect((await completed).map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
    const rows = await database.db.select().from(roadmapCheckpoints)
      .where(eq(roadmapCheckpoints.versionId, target.id));
    expect(rows.map((row) => row.position).sort()).toEqual([1, 2]);
  });

  it('serializes version position allocation with a version created during carry-over', async () => {
    const { source, checkpoint } = await setup();
    const held = holdMove(source.id, checkpoint.id, { newVersionLabel: 'v4' });
    const tx = await held.reached;
    const competing = second.createVersion(actor, projectId, { label: 'v5' });
    const completed = Promise.allSettled([held.moving, competing]);
    try { await waitForBlockedWriter(tx); } finally { held.release(); await completed; }
    expect((await completed).map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
    const roadmap = await new RoadmapRepository(database.db, new AccessService(database.db))
      .findForProject(actor, projectId);
    expect(roadmap.versions.map((version) => version.position)).toEqual([1, 2, 3, 4, 5]);
  });
});
