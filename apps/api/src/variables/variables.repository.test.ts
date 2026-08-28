import { randomBytes } from 'node:crypto';

import { AccessLevel, EnvironmentKind, Section, SubjectKind } from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import { InsufficientLevelError, SectionNotVisibleError } from '../access/access.errors';
import type { RequestSubject } from '../access/access.types';
import { CryptoService } from '../crypto/crypto.service';
import { environments, grants, projects, subjects, users, variableVersions } from '../db/schema';
import { VariablesRepository } from './variables.repository';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('репозиторий переменных', () => {
  let testDb: TestDatabase;
  let repository: VariablesRepository;
  let projectId: string;
  let environmentId: string;
  let otherEnvironmentId: string;
  let otherProjectId: string;
  let subjectId: string;
  let adminSubjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new VariablesRepository(
      testDb.db,
      new AccessService(testDb.db),
      new CryptoService(randomBytes(32).toString('base64')),
    );
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
    const [admin] = await testDb.db
      .insert(users)
      .values({
        subjectId: adminSubjectId,
        email: 'admin@cairn.local',
        passwordHash: 'хэш',
        isSuperadmin: true,
      })
      .returning();
    adminUserId = admin!.id;

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    subjectId = subject!.id;
    await testDb.db
      .insert(users)
      .values({ subjectId, email: 'user@cairn.local', passwordHash: 'хэш' });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;
    const [other] = await testDb.db
      .insert(projects)
      .values({ slug: 'chuzhoj', name: 'Чужой' })
      .returning();
    otherProjectId = other!.id;

    const [environment] = await testDb.db
      .insert(environments)
      .values({ projectId, name: 'Прод', kind: EnvironmentKind.Production })
      .returning();
    environmentId = environment!.id;
    const [otherEnvironment] = await testDb.db
      .insert(environments)
      .values({ projectId: otherProjectId, name: 'Прод', kind: EnvironmentKind.Production })
      .returning();
    otherEnvironmentId = otherEnvironment!.id;
  });

  const member = (): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'user@cairn.local',
    isSuperadmin: false,
    isRevoked: false,
  });

  const admin = (): RequestSubject => ({
    id: adminSubjectId,
    kind: SubjectKind.User,
    label: 'admin@cairn.local',
    isSuperadmin: true,
    isRevoked: false,
  });

  async function grant(level: AccessLevel): Promise<void> {
    await testDb.db.insert(grants).values({
      subjectId,
      projectId,
      section: Section.Variables,
      level,
      grantedBy: adminUserId,
    });
  }

  async function createVar(key = 'DATABASE_URL', value = 'postgres://secret'): Promise<string> {
    const created = await testDb.db.transaction((tx) =>
      repository.create(admin(), tx, projectId, environmentId, { key, value }),
    );

    return created.id;
  }

  describe('создание', () => {
    it('создаёт переменную с первой версией, зашифрованной на месте', async () => {
      const id = await createVar();

      const versions = await testDb.db
        .select()
        .from(variableVersions)
        .where(eq(variableVersions.variableId, id));

      expect(versions).toHaveLength(1);
      expect(versions[0]!.versionNo).toBe(1);
      expect(versions[0]!.valueEncrypted.startsWith('v1:')).toBe(true);
      expect(versions[0]!.valueEncrypted).not.toContain('postgres://secret');
    });

    it('не допускает двух переменных с одним ключом в окружении', async () => {
      await createVar();

      await expect(createVar()).rejects.toThrow();
    });

    it('допускает одинаковый ключ в разных окружениях', async () => {
      await createVar();

      const created = await testDb.db.transaction((tx) =>
        repository.create(admin(), tx, otherProjectId, otherEnvironmentId, {
          key: 'DATABASE_URL',
          value: 'другое',
        }),
      );

      expect(created.id).toBeDefined();
    });

    it('отказывает субъекту с уровнем чтения', async () => {
      await grant(AccessLevel.Read);

      await expect(
        testDb.db.transaction((tx) =>
          repository.create(member(), tx, projectId, environmentId, { key: 'K', value: 'v' }),
        ),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });
  });

  describe('список', () => {
    it('не содержит значения ни на одном уровне', async () => {
      await createVar();
      await grant(AccessLevel.Write);

      const [variable] = await repository.list(member(), projectId, environmentId);

      expect(variable).toMatchObject({ key: 'DATABASE_URL', currentVersion: 1 });
      expect(JSON.stringify(variable)).not.toContain('postgres://secret');
    });

    it('требует уровня метаданных', async () => {
      await expect(repository.list(member(), projectId, environmentId)).rejects.toBeInstanceOf(
        SectionNotVisibleError,
      );
    });

    it('отсортирован по ключу', async () => {
      await createVar('B_KEY', 'b');
      await createVar('A_KEY', 'a');

      const list = await repository.list(admin(), projectId, environmentId);

      expect(list.map((variable) => variable.key)).toEqual(['A_KEY', 'B_KEY']);
    });

    it('перечисляет окружения для переключателя по уровню переменных', async () => {
      await grant(AccessLevel.Metadata);

      const list = await repository.listEnvironments(member(), projectId);

      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ name: 'Прод', kind: EnvironmentKind.Production });
    });
  });

  describe('раскрытие', () => {
    it('возвращает исходное значение и номер версии', async () => {
      const id = await createVar();
      await grant(AccessLevel.Read);

      const revealed = await repository.reveal(member(), projectId, environmentId, id);

      expect(revealed).toEqual({ value: 'postgres://secret', versionNo: 1, key: 'DATABASE_URL' });
    });

    it('отказывает на уровне метаданных', async () => {
      const id = await createVar();
      await grant(AccessLevel.Metadata);

      await expect(
        repository.reveal(member(), projectId, environmentId, id),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });

    it('раскрывает историческую версию', async () => {
      const id = await createVar();
      await testDb.db.transaction((tx) =>
        repository.appendVersion(admin(), tx, projectId, environmentId, id, 'новое'),
      );

      const old = await repository.revealVersion(admin(), projectId, environmentId, id, 1);
      const current = await repository.reveal(admin(), projectId, environmentId, id);

      expect(old.value).toBe('postgres://secret');
      expect(current).toMatchObject({ value: 'новое', versionNo: 2 });
    });
  });

  describe('версии', () => {
    it('новое значение растит номер версии', async () => {
      const id = await createVar();

      const second = await testDb.db.transaction((tx) =>
        repository.appendVersion(admin(), tx, projectId, environmentId, id, 'второе'),
      );
      const third = await testDb.db.transaction((tx) =>
        repository.appendVersion(admin(), tx, projectId, environmentId, id, 'третье'),
      );

      expect(second).toBe(2);
      expect(third).toBe(3);
    });

    it('неизменившееся значение версии не создаёт', async () => {
      const id = await createVar();

      const result = await testDb.db.transaction((tx) =>
        repository.appendVersion(admin(), tx, projectId, environmentId, id, 'postgres://secret'),
      );

      expect(result).toBeNull();
      const versions = await testDb.db
        .select()
        .from(variableVersions)
        .where(eq(variableVersions.variableId, id));
      expect(versions).toHaveLength(1);
    });

    it('история отдаётся без значений, новые сверху', async () => {
      const id = await createVar();
      await testDb.db.transaction((tx) =>
        repository.appendVersion(admin(), tx, projectId, environmentId, id, 'второе'),
      );

      const history = await repository.versions(admin(), projectId, environmentId, id);

      expect(history.map((version) => version.versionNo)).toEqual([2, 1]);
      expect(JSON.stringify(history)).not.toContain('secret');
      expect(history[0]!.createdByLabel).toBe('admin@cairn.local');
    });

    it('откат создаёт новую версию со старым значением', async () => {
      const id = await createVar();
      await testDb.db.transaction((tx) =>
        repository.appendVersion(admin(), tx, projectId, environmentId, id, 'второе'),
      );

      const newVersion = await testDb.db.transaction((tx) =>
        repository.rollback(admin(), tx, projectId, environmentId, id, 1),
      );

      expect(newVersion).toBe(3);
      const revealed = await repository.reveal(admin(), projectId, environmentId, id);
      expect(revealed).toMatchObject({ value: 'postgres://secret', versionNo: 3 });
    });

    it('откат к несуществующей версии выглядит как «не найдено»', async () => {
      const id = await createVar();

      await expect(
        testDb.db.transaction((tx) =>
          repository.rollback(admin(), tx, projectId, environmentId, id, 99),
        ),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });
  });

  describe('удаление и принадлежность', () => {
    it('удаляет переменную вместе с версиями', async () => {
      const id = await createVar();

      await testDb.db.transaction((tx) =>
        repository.remove(admin(), tx, projectId, environmentId, id),
      );

      expect(await testDb.db.select().from(variableVersions)).toHaveLength(0);
    });

    it('не отдаёт переменную через чужое окружение', async () => {
      const id = await createVar();

      await expect(
        repository.reveal(admin(), otherProjectId, otherEnvironmentId, id),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });
  });
});
