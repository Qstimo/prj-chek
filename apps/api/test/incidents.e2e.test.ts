import { AccessLevel, EnvironmentKind, Section, SubjectKind } from '@cairn/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/auth/password.service';
import { DATABASE } from '../src/db/db.module';
import {
  addressIncidents,
  domains,
  environmentDomains,
  environments,
  grants,
  projects,
  subjects,
  users,
} from '../src/db/schema';
import { startTestDatabase, type TestDatabase } from './db-fixture';

/** Сутки в миллисекундах: отрезки падений задаются от «сейчас». */
const DAY_MS = 24 * 60 * 60 * 1000;

describe('HTTP: история падений адреса', () => {
  let testDb: TestDatabase;
  let app: INestApplication;
  let projectId: string;
  let addressId: string;
  let memberSubjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(testDb.db)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const passwordHash = await new PasswordService().hash('очень длинный пароль');

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    const [admin] = await testDb.db
      .insert(users)
      .values({
        subjectId: adminSubject!.id,
        email: 'admin@cairn.local',
        passwordHash,
        isSuperadmin: true,
      })
      .returning();
    adminUserId = admin!.id;

    const [memberSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    memberSubjectId = memberSubject!.id;
    await testDb.db
      .insert(users)
      .values({ subjectId: memberSubjectId, email: 'user@cairn.local', passwordHash });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;

    const [environment] = await testDb.db
      .insert(environments)
      .values({ projectId, name: 'прод', kind: EnvironmentKind.Production })
      .returning();
    const [root] = await testDb.db.insert(domains).values({ name: 'project.ru' }).returning();
    const [address] = await testDb.db
      .insert(environmentDomains)
      .values({ environmentId: environment!.id, domainId: root!.id, name: 'project.ru' })
      .returning();
    addressId = address!.id;
  });

  async function signIn(email: string) {
    const agent = request.agent(app.getHttpServer());

    await agent.post('/auth/login').send({ email, password: 'очень длинный пароль' }).expect(200);

    return agent;
  }

  async function grantSection(section: Section, level: AccessLevel): Promise<void> {
    await testDb.db.insert(grants).values({
      subjectId: memberSubjectId,
      projectId,
      section,
      level,
      grantedBy: adminUserId,
    });
  }

  async function fall(startedAgoMs: number, resolvedAgoMs: number | null): Promise<void> {
    await testDb.db.insert(addressIncidents).values({
      domainId: addressId,
      startedAt: new Date(Date.now() - startedAgoMs),
      resolvedAt: resolvedAgoMs === null ? null : new Date(Date.now() - resolvedAgoMs),
      cause: 'HTTP 500',
    });
  }

  const base = () => `/projects/${projectId}/addresses/${addressId}/incidents`;

  it('отдаёт сводку простоя и страницу падений', async () => {
    await fall(3 * DAY_MS, 2 * DAY_MS);
    const agent = await signIn('admin@cairn.local');

    const response = await agent.get(base()).expect(200);

    expect(response.body.window.days).toBe(30);
    expect(response.body.summary).toMatchObject({ falls: 1, downSeconds: DAY_MS / 1000 });
    expect(response.body.summary.uptime).toBeCloseTo(1 - 1 / 30, 5);
    expect(response.body.incidents).toHaveLength(1);
    expect(response.body.nextOffset).toBeNull();
  });

  it('окно и страница задаются параметрами адреса', async () => {
    await fall(10 * DAY_MS, 9 * DAY_MS);
    await fall(2 * DAY_MS, 1 * DAY_MS);
    const agent = await signIn('admin@cairn.local');

    const narrow = await agent.get(`${base()}?windowDays=7`).expect(200);
    const paged = await agent.get(`${base()}?limit=1`).expect(200);

    expect(narrow.body.summary.falls).toBe(1);
    expect(paged.body.incidents).toHaveLength(1);
    expect(paged.body.nextOffset).toBe(1);
  });

  it('негодное окно отвергается, а не сводится к умолчанию', async () => {
    const agent = await signIn('admin@cairn.local');

    await agent.get(`${base()}?windowDays=0`).expect(400);
  });

  it('уровня «метаданные» достаточно', async () => {
    // Ниже «метаданных» уровня нет: отказ 403 на этой ручке недостижим,
    // доступ либо есть, либо секция не раскрывается.
    await fall(DAY_MS, null);
    await grantSection(Section.Infrastructure, AccessLevel.Metadata);
    const agent = await signIn('user@cairn.local');

    const response = await agent.get(base()).expect(200);

    expect(response.body.open).not.toBeNull();
  });

  it('без выдачи на инфраструктуру — 404, как и у чужого адреса', async () => {
    await grantSection(Section.Roadmap, AccessLevel.Read);
    const member = await signIn('user@cairn.local');
    await member.get(base()).expect(404);

    const admin = await signIn('admin@cairn.local');
    const foreign = '00000000-0000-0000-0000-0000000000ff';
    await admin.get(`/projects/${projectId}/addresses/${foreign}/incidents`).expect(404);
  });

  it('требует входа', async () => {
    await request(app.getHttpServer()).get(base()).expect(401);
  });
});
