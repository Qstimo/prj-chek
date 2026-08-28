import { randomBytes } from 'node:crypto';

import { AccessLevel, EnvironmentKind, Section, SubjectKind } from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { CryptoService } from '../crypto/crypto.service';
import {
  auditLog,
  environments,
  grants,
  projects,
  subjects,
  users,
  variableVersions,
} from '../db/schema';
import { VariablesRepository } from './variables.repository';
import { VariablesService } from './variables.service';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('сервис переменных', () => {
  let testDb: TestDatabase;
  let service: VariablesService;
  let projectId: string;
  let environmentId: string;
  let subjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    service = new VariablesService(
      testDb.db,
      new VariablesRepository(
        testDb.db,
        new AccessService(testDb.db),
        new CryptoService(randomBytes(32).toString('base64')),
      ),
      new AuditService(),
    );
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    subjectId = subject!.id;
    await testDb.db.insert(users).values({
      subjectId,
      email: 'admin@cairn.local',
      passwordHash: 'хэш',
      isSuperadmin: true,
    });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;

    const [environment] = await testDb.db
      .insert(environments)
      .values({ projectId, name: 'Прод', kind: EnvironmentKind.Production })
      .returning();
    environmentId = environment!.id;
  });

  const admin = (): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'admin@cairn.local',
    isSuperadmin: true,
    isRevoked: false,
  });

  async function entriesOf(action: AuditAction) {
    return testDb.db.select().from(auditLog).where(eq(auditLog.action, action));
  }

  it('раскрытие возвращает значение и пишет в журнал', async () => {
    await service.create(admin(), projectId, environmentId, {
      key: 'DATABASE_URL',
      value: 'postgres://secret',
    });
    const [variable] = await service.list(admin(), projectId, environmentId);

    const revealed = await service.reveal(admin(), projectId, environmentId, variable!.id);

    expect(revealed.value).toBe('postgres://secret');

    const [entry] = await entriesOf(AuditAction.VariableRevealed);
    expect(entry?.metadata).toMatchObject({ key: 'DATABASE_URL', versionNo: 1 });
  });

  it('журнал не содержит значений ни после одного действия', async () => {
    // Полный цикл: создание, правка, раскрытие, откат, импорт, выгрузка.
    const SECRETS = ['postgres://secret', 'второе значение', 'из импорта'];

    await service.create(admin(), projectId, environmentId, {
      key: 'DATABASE_URL',
      value: SECRETS[0]!,
    });
    const [variable] = await service.list(admin(), projectId, environmentId);
    await service.update(admin(), projectId, environmentId, variable!.id, { value: SECRETS[1] });
    await service.reveal(admin(), projectId, environmentId, variable!.id);
    await service.rollback(admin(), projectId, environmentId, variable!.id, 1);
    await service.importEnv(admin(), projectId, environmentId, `IMPORTED=${SECRETS[2]}`);
    await service.exportEnv(admin(), projectId, environmentId);

    const entries = await testDb.db.select().from(auditLog);
    const serialized = JSON.stringify(entries);

    expect(entries.length).toBeGreaterThanOrEqual(6);
    for (const secret of SECRETS) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('правка значения пишет номер новой версии, но не значение', async () => {
    await service.create(admin(), projectId, environmentId, { key: 'KEY', value: 'старое' });
    const [variable] = await service.list(admin(), projectId, environmentId);

    await service.update(admin(), projectId, environmentId, variable!.id, { value: 'новое' });

    const [entry] = await entriesOf(AuditAction.VariableUpdated);
    expect(entry?.metadata).toMatchObject({ fields: ['value'], versionNo: 2 });
  });

  it('импорт различает создание, обновление и совпадение', async () => {
    await service.create(admin(), projectId, environmentId, { key: 'KEEP', value: 'то же' });
    await service.create(admin(), projectId, environmentId, { key: 'CHANGE', value: 'старое' });

    const result = await service.importEnv(
      admin(),
      projectId,
      environmentId,
      'KEEP=то же\nCHANGE=новое\nFRESH=создана',
    );

    expect(result).toEqual({ created: ['FRESH'], updated: ['CHANGE'], unchanged: ['KEEP'] });

    // Совпавшее значение не получило новой версии.
    const [keep] = await service.list(admin(), projectId, environmentId);
    expect(keep!.key).toBe('CHANGE');

    const [entry] = await entriesOf(AuditAction.VariablesImported);
    expect(entry?.metadata).toMatchObject({ created: ['FRESH'], updated: ['CHANGE'] });
  });

  it('выгрузка собирает env и пишет перечень ключей', async () => {
    await service.create(admin(), projectId, environmentId, { key: 'B_KEY', value: 'b' });
    await service.create(admin(), projectId, environmentId, { key: 'A_KEY', value: 'со пробелом' });

    const text = await service.exportEnv(admin(), projectId, environmentId);

    expect(text).toBe('A_KEY="со пробелом"\nB_KEY=b\n');

    const [entry] = await entriesOf(AuditAction.VariablesExported);
    expect(entry?.metadata).toMatchObject({ keys: ['A_KEY', 'B_KEY'] });
  });

  it('удаление пишет ключ в журнал', async () => {
    await service.create(admin(), projectId, environmentId, { key: 'KEY', value: 'x' });
    const [variable] = await service.list(admin(), projectId, environmentId);

    await service.remove(admin(), projectId, environmentId, variable!.id);

    const [entry] = await entriesOf(AuditAction.VariableDeleted);
    expect(entry?.metadata).toMatchObject({ key: 'KEY' });
    expect(await testDb.db.select().from(variableVersions)).toHaveLength(0);
  });

  it('агентское раскрытие работает при уровне метаданных и пишет журнал', async () => {
    // ТЗ 7.3: профиль токена даёт переменным метаданные, а раскрытие
    // разрешает отдельный флаг — этот путь и проверяется.
    await service.create(admin(), projectId, environmentId, {
      key: 'DATABASE_URL',
      value: 'postgres://secret',
    });
    const [variable] = await service.list(admin(), projectId, environmentId);

    const [agentSubjectRow] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.AgentToken, label: 'Cursor' })
      .returning();
    await testDb.db.insert(grants).values({
      subjectId: agentSubjectRow!.id,
      projectId,
      section: Section.Variables,
      level: AccessLevel.Metadata,
      grantedBy: (await testDb.db.select().from(users))[0]!.id,
    });

    const agent: RequestSubject = {
      id: agentSubjectRow!.id,
      kind: SubjectKind.AgentToken,
      label: 'Cursor',
      isSuperadmin: false,
      isRevoked: false,
    };

    // Обычное раскрытие агенту недоступно: уровень ниже чтения.
    await expect(service.reveal(agent, projectId, environmentId, variable!.id)).rejects.toThrow();

    const revealed = await service.revealForAgent(agent, projectId, environmentId, variable!.id);
    expect(revealed.value).toBe('postgres://secret');

    const [entry] = await entriesOf(AuditAction.VariableRevealed);
    expect(entry?.subjectKind).toBe(SubjectKind.AgentToken);
  });

  it('отказ по правам не оставляет следов в журнале', async () => {
    await expect(
      service.remove(admin(), projectId, environmentId, '11111111-1111-1111-1111-111111111111'),
    ).rejects.toThrow();

    expect(await entriesOf(AuditAction.VariableDeleted)).toHaveLength(0);
  });
});
