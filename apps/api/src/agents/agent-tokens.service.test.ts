import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { agentTokens, auditLog, grants, projects, subjects, users } from '../db/schema';
import { AgentTokensService } from './agent-tokens.service';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('сервис токенов агентов', () => {
  let testDb: TestDatabase;
  let service: AgentTokensService;
  let projectId: string;
  let adminSubjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new AgentTokensService(testDb.db, new AuditService());
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    adminSubjectId = adminSubject!.id;
    await testDb.db.insert(users).values({
      subjectId: adminSubjectId,
      email: 'admin@cairn.local',
      passwordHash: 'хэш',
      isSuperadmin: true,
    });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;
  });

  const admin = (): RequestSubject => ({
    id: adminSubjectId,
    kind: SubjectKind.User,
    label: 'admin@cairn.local',
    isSuperadmin: true,
    isRevoked: false,
  });

  it('создание даёт закрытый профиль из шести выдач', async () => {
    const { row } = await service.create(admin(), projectId, {
      label: 'Cursor',
      ttlDays: 90,
      canRevealVariables: false,
    });

    const issued = await testDb.db
      .select()
      .from(grants)
      .where(eq(grants.subjectId, row.subjectId));

    const byLevel = Object.fromEntries(issued.map((grant) => [grant.section, grant.level]));

    // ТЗ 7.3: инфо/документация/роадмап/хроника — чтение;
    // переменные — метаданные; инфраструктура — метаданные (статус).
    expect(byLevel).toEqual({
      [Section.Info]: AccessLevel.Read,
      [Section.Docs]: AccessLevel.Read,
      [Section.Roadmap]: AccessLevel.Read,
      [Section.Chronicle]: AccessLevel.Read,
      [Section.Variables]: AccessLevel.Metadata,
      [Section.Infrastructure]: AccessLevel.Metadata,
    });
  });

  it('токен аутентифицируется и обновляет last_used_at', async () => {
    const { token } = await service.create(admin(), projectId, {
      label: 'Cursor',
      ttlDays: 90,
      canRevealVariables: true,
    });

    const resolved = await service.authenticate(token);

    expect(resolved?.projectId).toBe(projectId);
    expect(resolved?.canRevealVariables).toBe(true);
    expect(resolved?.subject.kind).toBe(SubjectKind.AgentToken);

    const [row] = await testDb.db.select().from(agentTokens);
    expect(row?.lastUsedAt).not.toBeNull();
  });

  it('мусорный, отозванный и просроченный токены не аутентифицируются', async () => {
    expect(await service.authenticate('мусор')).toBeNull();

    const { row, token } = await service.create(admin(), projectId, {
      label: 'Cursor',
      ttlDays: 90,
      canRevealVariables: false,
    });
    await service.revoke(admin(), projectId, row.id);
    expect(await service.authenticate(token)).toBeNull();

    const { row: expiring, token: expiringToken } = await service.create(admin(), projectId, {
      label: 'Старый',
      ttlDays: 1,
      canRevealVariables: false,
    });
    await testDb.db
      .update(agentTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(agentTokens.id, expiring.id));
    expect(await service.authenticate(expiringToken)).toBeNull();
  });

  it('переключение флага и отзыв пишут журнал', async () => {
    const { row } = await service.create(admin(), projectId, {
      label: 'Cursor',
      ttlDays: 90,
      canRevealVariables: false,
    });

    await service.setRevealFlag(admin(), projectId, row.id, true);
    await service.revoke(admin(), projectId, row.id);

    const actions = (await testDb.db.select().from(auditLog)).map((entry) => entry.action);
    expect(actions).toContain(AuditAction.AgentTokenCreated);
    expect(actions).toContain(AuditAction.AgentTokenUpdated);
    expect(actions).toContain(AuditAction.AgentTokenRevoked);
  });

  it('отозванный токен исчезает из списка и больше не правится', async () => {
    const { row } = await service.create(admin(), projectId, {
      label: 'Cursor',
      ttlDays: 90,
      canRevealVariables: false,
    });

    await service.revoke(admin(), projectId, row.id);

    expect(await service.list(projectId)).toEqual([]);
    await expect(service.setRevealFlag(admin(), projectId, row.id, true)).rejects.toThrow(
      'Токен не найден',
    );
    await expect(service.revoke(admin(), projectId, row.id)).rejects.toThrow('Токен не найден');
  });

  it('создание токена для несуществующего проекта — «не найдено»', async () => {
    await expect(
      service.create(admin(), '11111111-1111-1111-1111-111111111111', {
        label: 'Cursor',
        ttlDays: 90,
        canRevealVariables: false,
      }),
    ).rejects.toThrow('Не найдено');
  });

  it('список не раскрывает хэшей', async () => {
    await service.create(admin(), projectId, {
      label: 'Cursor',
      ttlDays: 90,
      canRevealVariables: false,
    });

    const list = await service.list(projectId);

    expect(list[0]).toMatchObject({ label: 'Cursor', canRevealVariables: false });
    expect(JSON.stringify(list)).not.toContain('Hash');
    expect(JSON.stringify(list)).not.toContain('token_hash');
  });
});
