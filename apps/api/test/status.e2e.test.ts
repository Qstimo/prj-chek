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
  domains,
  environmentDomains,
  environments,
  grants,
  projects,
  subjects,
  users,
} from '../src/db/schema';
import { startTestDatabase, type TestDatabase } from './db-fixture';

describe('HTTP: статус', () => {
  let testDb: TestDatabase;
  let app: INestApplication;
  let projectId: string;
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
      .values({ projectId, name: 'Прод', kind: EnvironmentKind.Production })
      .returning();

    // Адрес окружения — его домен, по нему и идёт проверка. Петля без
    // слушателя закрыта и по 443, и по 80: реальная проверка быстро даст
    // «down», не выходя в сеть.
    const [root] = await testDb.db.insert(domains).values({ name: '127.0.0.1' }).returning();
    await testDb.db
      .insert(environmentDomains)
      .values({ environmentId: environment!.id, domainId: root!.id, name: '127.0.0.1' });
  });

  async function signIn(email: string) {
    const agent = request.agent(app.getHttpServer());

    await agent.post('/auth/login').send({ email, password: 'очень длинный пароль' }).expect(200);

    return agent;
  }

  async function grantInfra(level: AccessLevel): Promise<void> {
    await testDb.db.insert(grants).values({
      subjectId: memberSubjectId,
      projectId,
      section: Section.Infrastructure,
      level,
      grantedBy: adminUserId,
    });
  }

  it('до первого прогона статус «неизвестно»', async () => {
    await grantInfra(AccessLevel.Metadata);
    const agent = await signIn('user@cairn.local');

    const response = await agent.get(`/projects/${projectId}/status`).expect(200);

    expect(response.body.indicator).toBe('unknown');
    expect(response.body.environments[0].health).toBeNull();
  });

  it('после ручного прогона недоступное окружение даёт «аварию»', async () => {
    const admin = await signIn('admin@cairn.local');
    await admin.post('/status/run').expect(202);

    const status = await admin.get(`/projects/${projectId}/status`).expect(200);

    expect(status.body.indicator).toBe('down');
    expect(status.body.environments[0].health).toBe('down');
    expect(status.body.warnings.some((warning: { kind: string }) => warning.kind === 'health_down')).toBe(
      true,
    );
  });

  it('запуск проверок доступен только суперадмину', async () => {
    await grantInfra(AccessLevel.Metadata);
    const agent = await signIn('user@cairn.local');

    await agent.post('/status/run').expect(403);
  });

  it('без выдачи на инфраструктуру статус отвечает 404', async () => {
    const agent = await signIn('user@cairn.local');

    await agent.get(`/projects/${projectId}/status`).expect(404);
  });

  it('сводка содержит проект с выдачей и не содержит без', async () => {
    const agent = await signIn('user@cairn.local');

    expect((await agent.get('/status/summary').expect(200)).body).toEqual([]);

    await grantInfra(AccessLevel.Metadata);

    const summary = await agent.get('/status/summary').expect(200);
    expect(summary.body).toHaveLength(1);
    expect(summary.body[0]).toMatchObject({ projectId, projectName: 'Проект' });
  });

  it('требует входа', async () => {
    await request(app.getHttpServer()).get('/status/summary').expect(401);
  });
});
