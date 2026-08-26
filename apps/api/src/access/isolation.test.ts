import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from './access.service';
import { InsufficientLevelError, SectionNotVisibleError } from './access.errors';
import type { RequestSubject } from './access.types';
import { grants, projects, subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

/**
 * Изоляция доступа.
 *
 * Проверяет, что выдача не протекает за свои границы: на соседний проект,
 * на соседнего субъекта, на соседнюю секцию. Остальные тесты работают
 * с одной выдачей и одним субъектом, поэтому пропажа любого из трёх условий
 * выборки осталась бы в них незамеченной.
 */
describe('изоляция доступа', () => {
  let testDb: TestDatabase;
  let service: AccessService;
  let ownSubjectId: string;
  let otherSubjectId: string;
  let ownProjectId: string;
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

    const [own] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'свой' })
      .returning();
    ownSubjectId = own!.id;

    const [other] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'чужой' })
      .returning();
    otherSubjectId = other!.id;

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'админ' })
      .returning();
    const [admin] = await testDb.db
      .insert(users)
      .values({ subjectId: adminSubject!.id, email: 'admin@cairn.local', isSuperadmin: true })
      .returning();
    grantedBy = admin!.id;

    const [ownProject] = await testDb.db
      .insert(projects)
      .values({ slug: 'svoj', name: 'Свой проект' })
      .returning();
    ownProjectId = ownProject!.id;

    const [otherProject] = await testDb.db
      .insert(projects)
      .values({ slug: 'chuzhoj', name: 'Чужой проект' })
      .returning();
    otherProjectId = otherProject!.id;
  });

  const subject = (id: () => string): RequestSubject => ({
    get id() {
      return id();
    },
    kind: SubjectKind.User,
    label: 'субъект',
    isSuperadmin: false,
    isRevoked: false,
  });

  const own = () => subject(() => ownSubjectId);

  async function grant(
    subjectId: string,
    projectId: string,
    section: Section,
    level: AccessLevel,
  ): Promise<void> {
    await testDb.db.insert(grants).values({ subjectId, projectId, section, level, grantedBy });
  }

  describe('между проектами', () => {
    it('выдача на один проект не даёт доступа к другому', async () => {
      await grant(ownSubjectId, ownProjectId, Section.Info, AccessLevel.Write);

      expect(await service.resolveLevel(own(), otherProjectId, Section.Info)).toBeNull();
    });

    it('чужой проект не попадает в список видимых', async () => {
      await grant(ownSubjectId, ownProjectId, Section.Info, AccessLevel.Write);

      expect(await service.visibleProjectIds(own())).toEqual([ownProjectId]);
    });

    it('требование уровня на чужом проекте отвечает «не найдено»', async () => {
      await grant(ownSubjectId, ownProjectId, Section.Info, AccessLevel.Write);

      await expect(
        service.requireLevel(own(), otherProjectId, Section.Info, AccessLevel.Metadata),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });
  });

  describe('между субъектами', () => {
    it('чужая выдача не даёт доступа', async () => {
      await grant(otherSubjectId, ownProjectId, Section.Info, AccessLevel.Write);

      expect(await service.resolveLevel(own(), ownProjectId, Section.Info)).toBeNull();
    });

    it('проект с чужой выдачей не попадает в список видимых', async () => {
      await grant(otherSubjectId, ownProjectId, Section.Info, AccessLevel.Write);

      expect(await service.visibleProjectIds(own())).toEqual([]);
    });

    it('свою выдачу от чужой отличает именно субъект', async () => {
      // Обе выдачи на один проект и одну секцию, но разного уровня:
      // если фильтр по субъекту пропадёт, уровень окажется чужим.
      await grant(otherSubjectId, ownProjectId, Section.Info, AccessLevel.Write);
      await grant(ownSubjectId, ownProjectId, Section.Info, AccessLevel.Metadata);

      expect(await service.resolveLevel(own(), ownProjectId, Section.Info)).toBe(
        AccessLevel.Metadata,
      );
    });
  });

  describe('между секциями', () => {
    it('выдача на одну секцию не даёт доступа к другой', async () => {
      await grant(ownSubjectId, ownProjectId, Section.Docs, AccessLevel.Write);

      expect(await service.resolveLevel(own(), ownProjectId, Section.Info)).toBeNull();
    });

    it('уровни разных секций не смешиваются', async () => {
      await grant(ownSubjectId, ownProjectId, Section.Docs, AccessLevel.Write);
      await grant(ownSubjectId, ownProjectId, Section.Info, AccessLevel.Metadata);

      await expect(
        service.requireLevel(own(), ownProjectId, Section.Info, AccessLevel.Read),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });
  });
});

describe('коды ответов', () => {
  it('отсутствие доступа — это 404', () => {
    // Ответ 403 сообщил бы, что объект существует, а ТЗ 4.2 требует
    // не раскрывать даже сам факт его существования.
    expect(new SectionNotVisibleError().getStatus()).toBe(404);
  });

  it('недостаточный уровень — это 403', () => {
    // Отрицать существование объекта, который субъект только что видел,
    // бессмысленно (спека 5.3).
    expect(new InsufficientLevelError().getStatus()).toBe(403);
  });
});
