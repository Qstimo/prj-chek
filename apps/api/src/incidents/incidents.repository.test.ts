import { EnvironmentKind, Section, SubjectKind, AccessLevel } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import {
  domains,
  environmentDomains,
  environments,
  grants,
  projects,
  subjects,
  users,
} from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';
import { PAST_INCIDENTS_LIMIT } from './constants';
import { IncidentsRepository } from './incidents.repository';

describe('репозиторий инцидентов', () => {
  let testDb: TestDatabase;
  let repository: IncidentsRepository;
  let projectId: string;
  let adminSubjectId: string;
  let outsiderSubjectId: string;
  let domainId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new IncidentsRepository(testDb.db, new AccessService(testDb.db));
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [admin] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    adminSubjectId = admin!.id;
    const [adminUser] = await testDb.db
      .insert(users)
      .values({
        subjectId: adminSubjectId,
        email: 'admin@cairn.local',
        passwordHash: 'хэш',
        isSuperadmin: true,
      })
      .returning();

    const [outsider] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'outsider@cairn.local' })
      .returning();
    outsiderSubjectId = outsider!.id;
    await testDb.db
      .insert(users)
      .values({ subjectId: outsiderSubjectId, email: 'outsider@cairn.local', passwordHash: 'х' });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'CAIRN' })
      .returning();
    projectId = project!.id;

    // Чужому проект виден — но не секция инфраструктуры: иначе тест на
    // 404 проверял бы невидимость проекта, а не секции.
    await testDb.db.insert(grants).values({
      subjectId: outsiderSubjectId,
      projectId,
      section: Section.Roadmap,
      level: AccessLevel.Read,
      grantedBy: adminUser!.id,
    });

    const [environment] = await testDb.db
      .insert(environments)
      .values({ projectId, name: 'прод', kind: EnvironmentKind.Production })
      .returning();
    const [root] = await testDb.db.insert(domains).values({ name: 'project.ru' }).returning();
    const [address] = await testDb.db
      .insert(environmentDomains)
      .values({ environmentId: environment!.id, domainId: root!.id, name: 'project.ru' })
      .returning();
    domainId = address!.id;
  });

  const superadmin = (): RequestSubject => ({
    id: adminSubjectId,
    kind: SubjectKind.User,
    label: 'admin@cairn.local',
    isSuperadmin: true,
    isRevoked: false,
  });

  const outsider = (): RequestSubject => ({
    id: outsiderSubjectId,
    kind: SubjectKind.User,
    label: 'outsider@cairn.local',
    isSuperadmin: false,
    isRevoked: false,
  });

  it('открывает инцидент с причиной', async () => {
    const incident = await repository.open(domainId, 'HTTP 500');

    expect(incident.cause).toBe('HTTP 500');
    expect(incident.resolvedAt).toBeNull();
  });

  it('второй открытый инцидент на адрес не заводится', async () => {
    // База держит это сама: частичный уникальный индекс.
    await repository.open(domainId, 'таймаут');

    await expect(repository.open(domainId, 'таймаут')).rejects.toThrow();
  });

  it('закрывает открытый инцидент и отдаёт закрытую строку', async () => {
    await repository.open(domainId, 'таймаут');

    const resolved = await repository.resolve(domainId, new Date('2026-10-20T11:00:00Z'));

    expect(resolved?.resolvedAt).toEqual(new Date('2026-10-20T11:00:00Z'));
  });

  it('закрывать нечего — отдаёт пусто, а не падает', async () => {
    expect(await repository.resolve(domainId, new Date())).toBeNull();
  });

  it('после закрытия адрес снова может упасть', async () => {
    // Иначе индекс запретил бы второе падение за всё время.
    await repository.open(domainId, 'раз');
    await repository.resolve(domainId, new Date());

    await expect(repository.open(domainId, 'два')).resolves.toBeDefined();
  });

  it('открытые инциденты отдаются картой по адресу', async () => {
    await repository.open(domainId, 'таймаут');

    expect((await repository.openByDomain()).get(domainId)?.cause).toBe('таймаут');
  });

  it('выдача по проекту делит открытый и закрытые', async () => {
    await repository.open(domainId, 'раз');
    await repository.resolve(domainId, new Date('2026-10-20T11:00:00Z'));
    await repository.open(domainId, 'два');

    const [address] = await repository.forProject(superadmin(), projectId);

    expect(address?.open?.cause).toBe('два');
    expect(address?.past).toHaveLength(1);
  });

  it('предел истории применяется в запросе, а не после выборки', async () => {
    // Иначе таблица, которая не чистится, будет выбираться целиком ради
    // двадцати строк.
    for (let attempt = 0; attempt < PAST_INCIDENTS_LIMIT + 3; attempt += 1) {
      await repository.open(domainId, `отказ ${attempt}`);
      await repository.resolve(domainId, new Date());
    }

    const [address] = await repository.forProject(superadmin(), projectId);

    expect(address?.past).toHaveLength(PAST_INCIDENTS_LIMIT);
  });

  it('без доступа к инфраструктуре проект не раскрывается', async () => {
    // Отсутствие доступа — 404, а не 403: иначе ответ подтвердил бы,
    // что проект существует.
    await expect(repository.forProject(outsider(), projectId)).rejects.toThrow();
  });
});
