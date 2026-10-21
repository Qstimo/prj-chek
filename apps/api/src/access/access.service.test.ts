import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from './access.service';
import type { RequestSubject } from './access.types';
import { grants, projects, subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('AccessService.resolveLevel', () => {
  let testDb: TestDatabase;
  let service: AccessService;
  let projectId: string;
  let subjectId: string;
  let adminSubjectId: string;
  let otherProjectId: string;
  let grantedBy: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new AccessService(testDb.db);
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
    adminSubjectId = adminSubject!.id;
    const [admin] = await testDb.db
      .insert(users)
      .values({ subjectId: adminSubjectId, email: 'admin@cairn.local', isSuperadmin: true })
      .returning();
    grantedBy = admin!.id;

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;

    const [other] = await testDb.db
      .insert(projects)
      .values({ slug: 'drugoy', name: 'Другой' })
      .returning();
    otherProjectId = other!.id;
  });

  /** Выдаёт подрядчику уровень на секции проекта. */
  async function grant(section: Section, level: AccessLevel): Promise<void> {
    await testDb.db.insert(grants).values({ subjectId, projectId, section, level, grantedBy });
  }

  function asSubject(overrides: Partial<RequestSubject> = {}): RequestSubject {
    return {
      id: subjectId,
      kind: SubjectKind.User,
      label: 'подрядчик',
      isSuperadmin: false,
      isRevoked: false,
      ...overrides,
    };
  }

  it('без выдачи возвращает отсутствие доступа', async () => {
    expect(await service.resolveLevel(asSubject(), projectId, Section.Info)).toBeNull();
  });

  it('возвращает выданный уровень', async () => {
    await testDb.db.insert(grants).values({
      subjectId,
      projectId,
      section: Section.Info,
      level: AccessLevel.Read,
      grantedBy,
    });

    expect(await service.resolveLevel(asSubject(), projectId, Section.Info)).toBe(AccessLevel.Read);
  });

  it('не переносит доступ между секциями', async () => {
    await testDb.db.insert(grants).values({
      subjectId,
      projectId,
      section: Section.Docs,
      level: AccessLevel.Write,
      grantedBy,
    });

    expect(await service.resolveLevel(asSubject(), projectId, Section.Info)).toBeNull();
  });

  it('суперадмину даёт запись без выдачи', async () => {
    const level = await service.resolveLevel(
      asSubject({ isSuperadmin: true }),
      projectId,
      Section.Info,
    );

    expect(level).toBe(AccessLevel.Write);
  });

  it('отозванному субъекту отказывает даже при живой выдаче', async () => {
    await testDb.db.insert(grants).values({
      subjectId,
      projectId,
      section: Section.Info,
      level: AccessLevel.Write,
      grantedBy,
    });

    expect(await service.resolveLevel(asSubject({ isRevoked: true }), projectId, Section.Info)).toBeNull();
  });

  it('отозванному суперадмину отказывает', async () => {
    // Отзыв сильнее суперадминства: иначе отозвать администратора было бы нечем.
    const level = await service.resolveLevel(
      asSubject({ isSuperadmin: true, isRevoked: true }),
      projectId,
      Section.Info,
    );

    expect(level).toBeNull();
  });
  describe('субъекты с уровнем на секции', () => {
    const infra = (minimum: AccessLevel) =>
      service.subjectsWithLevel(projectId, Section.Infrastructure, minimum);

    it('выдача на инфраструктуре попадает в список', async () => {
      await grant(Section.Infrastructure, AccessLevel.Metadata);

      expect(await infra(AccessLevel.Metadata)).toContain(subjectId);
    });

    it('выдача на другой секции в список не попадает', async () => {
      await grant(Section.Roadmap, AccessLevel.Write);

      expect(await infra(AccessLevel.Metadata)).not.toContain(subjectId);
    });

    it('суперадмин попадает без всякой выдачи', async () => {
      expect(await infra(AccessLevel.Metadata)).toContain(adminSubjectId);
    });

    it('отозванный субъект не попадает, даже будучи суперадмином', async () => {
      // Отзыв сильнее суперадминства — иначе отозвать администратора
      // было бы нечем.
      await testDb.db
        .update(subjects)
        .set({ revokedAt: new Date() })
        .where(eq(subjects.id, adminSubjectId));

      expect(await infra(AccessLevel.Metadata)).not.toContain(adminSubjectId);
    });

    it('уровень ниже требуемого не попадает', async () => {
      await grant(Section.Infrastructure, AccessLevel.Metadata);

      expect(await infra(AccessLevel.Write)).not.toContain(subjectId);
    });

    it('чужой проект своих подписчиков не отдаёт', async () => {
      await grant(Section.Infrastructure, AccessLevel.Read);

      expect(
        await service.subjectsWithLevel(
          otherProjectId,
          Section.Infrastructure,
          AccessLevel.Metadata,
        ),
      ).not.toContain(subjectId);
    });
  });
});
