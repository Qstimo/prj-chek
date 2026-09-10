import { AccessLevel, EnvironmentKind, Section, SubjectKind } from '@cairn/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthModule } from '../src/auth/auth.module';
import { PasswordService } from '../src/auth/password.service';
import { DATABASE } from '../src/db/db.module';
import { DomainsModule } from '../src/domains/domains.module';
import { EnvironmentsModule } from '../src/environments/environments.module';
import { StatusModule } from '../src/status/status.module';
import { auditLog, environments, grants, projects, subjects, users } from '../src/db/schema';
import { startTestDatabase, type TestDatabase } from './db-fixture';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Календарный день через `days` суток от сегодня в формате контракта. */
function inDays(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
}

describe('домены по HTTP', () => {
  let testDb: TestDatabase;
  let app: INestApplication;
  let projectId: string;
  let environmentId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule, DomainsModule, EnvironmentsModule, StatusModule],
    })
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

    const [memberSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    await testDb.db
      .insert(users)
      .values({ subjectId: memberSubject!.id, email: 'user@cairn.local', passwordHash });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'vitrina', name: 'Витрина' })
      .returning();
    projectId = project!.id;

    const [environment] = await testDb.db
      .insert(environments)
      .values({ projectId, name: 'Прод', kind: EnvironmentKind.Production })
      .returning();
    environmentId = environment!.id;

    await testDb.db.insert(grants).values({
      subjectId: memberSubject!.id,
      projectId,
      section: Section.Infrastructure,
      level: AccessLevel.Write,
      grantedBy: admin!.id,
    });
  });

  async function signIn(email: string) {
    const agent = request.agent(app.getHttpServer());

    await agent.post('/auth/login').send({ email, password: 'очень длинный пароль' }).expect(200);

    return agent;
  }

  /** Вписывает домены в окружение от лица переданного агента. */
  async function setDomains(
    agent: Awaited<ReturnType<typeof signIn>>,
    domains: string[],
    expected = 200,
  ): Promise<void> {
    await agent
      .patch(`/projects/${projectId}/environments/${environmentId}`)
      .send({ domains })
      .expect(expected);
  }

  it('реестр закрыт от подрядчика', async () => {
    const member = await signIn('user@cairn.local');

    await member.get('/domains').expect(403);
    await member.get('/domains/map').expect(403);
    await member.post('/domains').send({ name: 'example.com' }).expect(403);
  });

  it('подрядчик вписывает домен, а корень появляется в реестре сам', async () => {
    // Ради адреса стенда не нужно дёргать владельца реестра.
    const member = await signIn('user@cairn.local');
    await setDomains(member, ['stage.example.com']);

    const admin = await signIn('admin@cairn.local');
    const registry = await admin.get('/domains').expect(200);

    expect(registry.body).toHaveLength(1);
    expect(registry.body[0]).toMatchObject({
      name: 'example.com',
      owner: null,
      subdomainCount: 1,
      projectCount: 1,
    });
  });

  it('поддомены разных проектов сходятся на одном корне', async () => {
    const member = await signIn('user@cairn.local');
    await setDomains(member, ['stage.example.com', 'api.example.com']);

    const admin = await signIn('admin@cairn.local');
    const registry = await admin.get('/domains').expect(200);

    expect(registry.body).toHaveLength(1);
    expect(registry.body[0]).toMatchObject({ subdomainCount: 2 });
  });

  it('срок продления попадает в статус проекта на этом корне', async () => {
    const member = await signIn('user@cairn.local');
    await setDomains(member, ['stage.example.com']);

    const admin = await signIn('admin@cairn.local');
    const [root] = (await admin.get('/domains').expect(200)).body;

    await admin.patch(`/domains/${root.id}`).send({ paidUntil: inDays(5) }).expect(200);

    const status = await admin.get(`/projects/${projectId}/status`).expect(200);

    expect(status.body.warnings).toContainEqual(
      expect.objectContaining({ kind: 'domain_renewal_expiring', subject: 'example.com' }),
    );
    expect(status.body.indicator).toBe('warning');
  });

  it('карта показывает ребро между корнем и проектом', async () => {
    const member = await signIn('user@cairn.local');
    await setDomains(member, ['stage.example.com']);

    const admin = await signIn('admin@cairn.local');
    const [root] = (await admin.get('/domains').expect(200)).body;

    const map = await admin.get('/domains/map').expect(200);

    expect(map.body.edges).toEqual([
      expect.objectContaining({
        domainId: root.id,
        projectId,
        subdomains: [expect.objectContaining({ name: 'stage.example.com' })],
      }),
    ]);
  });

  it('занятый корень не удаляется, освобождённый удаляется', async () => {
    const member = await signIn('user@cairn.local');
    await setDomains(member, ['stage.example.com']);

    const admin = await signIn('admin@cairn.local');
    const [root] = (await admin.get('/domains').expect(200)).body;

    await admin.delete(`/domains/${root.id}`).expect(409);

    await setDomains(member, []);

    await admin.delete(`/domains/${root.id}`).expect(204);
  });

  it('правка корня попадает в журнал', async () => {
    const admin = await signIn('admin@cairn.local');
    const created = await admin.post('/domains').send({ name: 'example.com' }).expect(201);

    await admin
      .patch(`/domains/${created.body.id}`)
      .send({ owner: 'ООО Ромашка' })
      .expect(200);

    const entries = await testDb.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'domain.updated'));

    expect(entries).toHaveLength(1);
    expect(entries[0]?.metadata).toMatchObject({ name: 'example.com', fields: ['owner'] });
  });
});
