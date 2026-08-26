import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { GrantsRepository } from './grants.repository';
import { grants, projects, subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('GrantsRepository', () => {
  let testDb: TestDatabase;
  let repository: GrantsRepository;
  let subjectId: string;
  let grantedBy: string;
  let projectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new GrantsRepository(testDb.db);
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'подрядчик' })
      .returning();
    subjectId = subject!.id;

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'админ' })
      .returning();
    const [admin] = await testDb.db
      .insert(users)
      .values({ subjectId: adminSubject!.id, email: 'admin@cairn.local', isSuperadmin: true })
      .returning();
    grantedBy = admin!.id;

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;
  });

  describe('set', () => {
    it('создаёт выдачу', async () => {
      await testDb.db.transaction(async (tx) => {
        await repository.set(tx, projectId, grantedBy, {
          subjectId,
          section: Section.Info,
          level: AccessLevel.Read,
        });
      });

      const rows = await testDb.db.select().from(grants);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.level).toBe(AccessLevel.Read);
    });

    it('меняет уровень вместо создания второй строки', async () => {
      // Уникальный индекс по тройке: две выдачи на одну пару разошлись бы в выборках.
      await testDb.db.transaction(async (tx) => {
        await repository.set(tx, projectId, grantedBy, {
          subjectId,
          section: Section.Info,
          level: AccessLevel.Read,
        });
        await repository.set(tx, projectId, grantedBy, {
          subjectId,
          section: Section.Info,
          level: AccessLevel.Write,
        });
      });

      const rows = await testDb.db.select().from(grants);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.level).toBe(AccessLevel.Write);
    });
  });

  describe('revoke', () => {
    it('удаляет строку выдачи', async () => {
      // Отсутствие доступа выражается отсутствием строки (спека 4.3).
      await testDb.db.transaction(async (tx) => {
        await repository.set(tx, projectId, grantedBy, {
          subjectId,
          section: Section.Info,
          level: AccessLevel.Read,
        });
        await repository.revoke(tx, projectId, { subjectId, section: Section.Info });
      });

      expect(await testDb.db.select().from(grants)).toHaveLength(0);
    });

    it('сообщает, что выдачи не было', async () => {
      const removed = await testDb.db.transaction((tx) =>
        repository.revoke(tx, projectId, { subjectId, section: Section.Info }),
      );

      expect(removed).toBe(false);
    });

    it('сообщает, что выдача была', async () => {
      // Вызывающий сервис пишет в журнал только состоявшийся отзыв.
      const removed = await testDb.db.transaction(async (tx) => {
        await repository.set(tx, projectId, grantedBy, {
          subjectId,
          section: Section.Info,
          level: AccessLevel.Read,
        });

        return repository.revoke(tx, projectId, { subjectId, section: Section.Info });
      });

      expect(removed).toBe(true);
    });
  });

  describe('matrixForProject', () => {
    it('возвращает строку на каждый субъект с выдачей', async () => {
      await testDb.db.transaction(async (tx) => {
        await repository.set(tx, projectId, grantedBy, {
          subjectId,
          section: Section.Info,
          level: AccessLevel.Read,
        });
      });

      const matrix = await repository.matrixForProject(projectId);

      expect(matrix).toHaveLength(1);
      expect(matrix[0]?.levels[Section.Info]).toBe(AccessLevel.Read);
    });

    it('собирает несколько секций в одну строку', async () => {
      await testDb.db.transaction(async (tx) => {
        await repository.set(tx, projectId, grantedBy, {
          subjectId,
          section: Section.Info,
          level: AccessLevel.Read,
        });
        await repository.set(tx, projectId, grantedBy, {
          subjectId,
          section: Section.Docs,
          level: AccessLevel.Write,
        });
      });

      const matrix = await repository.matrixForProject(projectId);

      expect(matrix).toHaveLength(1);
      expect(matrix[0]?.levels).toEqual({
        [Section.Info]: AccessLevel.Read,
        [Section.Docs]: AccessLevel.Write,
      });
    });
  });
});
