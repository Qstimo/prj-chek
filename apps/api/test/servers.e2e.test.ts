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
import { EnvironmentsModule } from '../src/environments/environments.module';
import { ServersModule } from '../src/servers/servers.module';
import { StatusModule } from '../src/status/status.module';
import { auditLog, environments, grants, projects, subjects, users } from '../src/db/schema';
import { startTestDatabase, type TestDatabase } from './db-fixture';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Календарный день через `days` суток от сегодня в формате контракта. */
function inDays(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
}

describe('серверы по HTTP', () => {
  let testDb: TestDatabase;
  let app: INestApplication;
  let projectId: string;
  let environmentId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule, ServersModule, EnvironmentsModule, StatusModule],
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

  /** Заводит сервер от лица суперадмина и возвращает его идентификатор. */
  async function createServer(
    admin: Awaited<ReturnType<typeof signIn>>,
    body: Record<string, unknown>,
  ): Promise<string> {
    const response = await admin.post('/servers').send(body).expect(201);

    return response.body.id as string;
  }

  it('суперадмин ведёт реестр серверов', async () => {
    const admin = await signIn('admin@cairn.local');

    await createServer(admin, { name: 'hetzner-fsn-1', owner: 'ООО Ромашка' });

    const response = await admin.get('/servers').expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      name: 'hetzner-fsn-1',
      owner: 'ООО Ромашка',
      projectCount: 0,
    });
  });

  it('обычному пользователю реестр закрыт', async () => {
    // Отказ 403, а не 404: существование раздела администрирования
    // секретом не является — в отличие от существования проектов.
    const member = await signIn('user@cairn.local');

    await member.get('/servers').expect(403);
    await member.get('/servers/map').expect(403);
    await member.post('/servers').send({ name: 'srv' }).expect(403);
  });

  it('привязка окружения к серверу видна в деталях машины и в карточке окружения', async () => {
    const admin = await signIn('admin@cairn.local');
    const serverId = await createServer(admin, { name: 'hetzner-fsn-1', ip: '203.0.113.10' });

    await admin
      .patch(`/projects/${projectId}/environments/${environmentId}`)
      .send({ serverId })
      .expect(200);

    const detail = await admin.get(`/servers/${serverId}`).expect(200);

    expect(detail.body.environments).toEqual([
      expect.objectContaining({ name: 'Прод', projectName: 'Витрина' }),
    ]);

    const member = await signIn('user@cairn.local');
    const environmentResponse = await member
      .get(`/projects/${projectId}/environments`)
      .expect(200);

    expect(environmentResponse.body[0].server).toMatchObject({
      name: 'hetzner-fsn-1',
      ip: '203.0.113.10',
    });
  });

  it('подрядчик не может привязать окружение к серверу сам', async () => {
    const admin = await signIn('admin@cairn.local');
    const serverId = await createServer(admin, { name: 'hetzner-fsn-1' });

    const member = await signIn('user@cairn.local');

    await member
      .patch(`/projects/${projectId}/environments/${environmentId}`)
      .send({ serverId })
      .expect(403);
  });

  it('срок оплаты попадает в статус проекта на этой машине', async () => {
    const admin = await signIn('admin@cairn.local');
    const serverId = await createServer(admin, { name: 'hetzner-fsn-1', paidUntil: inDays(5) });

    await admin
      .patch(`/projects/${projectId}/environments/${environmentId}`)
      .send({ serverId })
      .expect(200);

    const status = await admin.get(`/projects/${projectId}/status`).expect(200);

    expect(status.body.warnings).toContainEqual(
      expect.objectContaining({ kind: 'server_expiring', subject: 'hetzner-fsn-1' }),
    );
    expect(status.body.indicator).toBe('warning');
  });

  it('карта показывает ребро между машиной и проектом', async () => {
    const admin = await signIn('admin@cairn.local');
    const serverId = await createServer(admin, { name: 'hetzner-fsn-1' });

    await admin
      .patch(`/projects/${projectId}/environments/${environmentId}`)
      .send({ serverId })
      .expect(200);

    const map = await admin.get('/servers/map').expect(200);

    expect(map.body.edges).toEqual([
      expect.objectContaining({
        serverId,
        projectId,
        environments: [expect.objectContaining({ name: 'Прод' })],
      }),
    ]);
  });

  it('занятый сервер не удаляется, свободный удаляется', async () => {
    const admin = await signIn('admin@cairn.local');
    const serverId = await createServer(admin, { name: 'hetzner-fsn-1' });

    await admin
      .patch(`/projects/${projectId}/environments/${environmentId}`)
      .send({ serverId })
      .expect(200);

    await admin.delete(`/servers/${serverId}`).expect(409);

    await admin
      .patch(`/projects/${projectId}/environments/${environmentId}`)
      .send({ serverId: null })
      .expect(200);

    await admin.delete(`/servers/${serverId}`).expect(204);
  });

  it('создание сервера попадает в журнал', async () => {
    const admin = await signIn('admin@cairn.local');

    await createServer(admin, { name: 'hetzner-fsn-1' });

    const entries = await testDb.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'server.created'));

    expect(entries).toHaveLength(1);
    expect(entries[0]?.projectId).toBeNull();
  });
});
