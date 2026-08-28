import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import { text } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/auth/password.service';
import { DATABASE } from '../src/db/db.module';
import { auditLog, grants, projects, subjects, users } from '../src/db/schema';
import { startTestDatabase, type TestDatabase } from './db-fixture';

describe('HTTP: приёмный канал', () => {
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
    // Тот же разбор текста, что и в main.ts: сводку шлют и чистым текстом.
    app.use(text({ type: 'text/plain', limit: '64kb' }));
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
  });

  async function signIn(email: string) {
    const agent = request.agent(app.getHttpServer());

    await agent.post('/auth/login').send({ email, password: 'очень длинный пароль' }).expect(200);

    return agent;
  }

  async function grantChronicle(level: AccessLevel): Promise<void> {
    await testDb.db.insert(grants).values({
      subjectId: memberSubjectId,
      projectId,
      section: Section.Chronicle,
      level,
      grantedBy: adminUserId,
    });
  }

  async function createAddress(): Promise<string> {
    const admin = await signIn('admin@cairn.local');
    const response = await admin.post(`/projects/${projectId}/intake-address`).expect(201);

    return response.body.token;
  }

  describe('управление адресом', () => {
    it('суперадмин создаёт адрес в обеих формах', async () => {
      const admin = await signIn('admin@cairn.local');

      const response = await admin.post(`/projects/${projectId}/intake-address`).expect(201);

      expect(response.body.token.length).toBeGreaterThanOrEqual(32);
      expect(response.body.webhookUrl).toContain(`/api/intake/${response.body.token}`);
      expect(response.body.emailAddress).toContain('@intake.');
    });

    it('повторное создание отвечает 409', async () => {
      const admin = await signIn('admin@cairn.local');

      await admin.post(`/projects/${projectId}/intake-address`).expect(201);
      await admin.post(`/projects/${projectId}/intake-address`).expect(409);
    });

    it('пишущий в хронику видит адрес', async () => {
      await createAddress();
      await grantChronicle(AccessLevel.Write);
      const agent = await signIn('user@cairn.local');

      const response = await agent.get(`/projects/${projectId}/intake-address`).expect(200);

      expect(response.body.webhookUrl).toBeDefined();
    });

    it('читателю хроники адрес не показывается', async () => {
      await createAddress();
      await grantChronicle(AccessLevel.Read);
      const agent = await signIn('user@cairn.local');

      await agent.get(`/projects/${projectId}/intake-address`).expect(403);
    });

    it('без выдачи адрес выглядит несуществующим', async () => {
      await createAddress();
      const agent = await signIn('user@cairn.local');

      await agent.get(`/projects/${projectId}/intake-address`).expect(404);
    });

    it('не-суперадмин не создаёт и не отзывает адрес', async () => {
      await grantChronicle(AccessLevel.Write);
      const agent = await signIn('user@cairn.local');

      await agent.post(`/projects/${projectId}/intake-address`).expect(403);
      await agent.delete(`/projects/${projectId}/intake-address`).expect(403);
    });
  });

  describe('приём входящих', () => {
    it('принимает JSON без сессии и кладёт запись в хронику', async () => {
      const token = await createAddress();

      const response = await request(app.getHttpServer())
        .post(`/intake/${token}`)
        .send({ content: 'Первая строка сводки\nПодробности ниже' })
        .expect(201);

      expect(response.body).toMatchObject({
        title: 'Первая строка сводки',
        source: 'webhook',
      });

      const admin = await signIn('admin@cairn.local');
      const feed = await admin.get(`/projects/${projectId}/chronicle`).expect(200);
      expect(feed.body[0]).toMatchObject({ source: 'webhook' });
    });

    it('сохраняет переданные заголовок и дату', async () => {
      const token = await createAddress();

      const response = await request(app.getHttpServer())
        .post(`/intake/${token}`)
        .send({ title: 'Встреча', content: 'Сводка', occurredOn: '2026-08-20' })
        .expect(201);

      expect(response.body).toMatchObject({ title: 'Встреча', occurredOn: '2026-08-20' });
    });

    it('принимает чистый текст', async () => {
      const token = await createAddress();

      const response = await request(app.getHttpServer())
        .post(`/intake/${token}`)
        .set('Content-Type', 'text/plain')
        .send('Сводка встречи текстом')
        .expect(201);

      expect(response.body.title).toBe('Сводка встречи текстом');
    });

    it('отвечает 404 на мусорный токен', async () => {
      await request(app.getHttpServer())
        .post('/intake/несуществующий-токен')
        .send({ content: 'Текст' })
        .expect(404);
    });

    it('после отзыва адреса прежний токен отвечает 404', async () => {
      const token = await createAddress();
      const admin = await signIn('admin@cairn.local');
      await admin.delete(`/projects/${projectId}/intake-address`).expect(204);

      await request(app.getHttpServer())
        .post(`/intake/${token}`)
        .send({ content: 'Текст' })
        .expect(404);
    });

    it('помечает запись журнала машинным субъектом', async () => {
      const token = await createAddress();

      await request(app.getHttpServer())
        .post(`/intake/${token}`)
        .send({ content: 'Сводка' })
        .expect(201);

      const [entry] = await testDb.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, 'chronicle_entry.created'));

      expect(entry?.subjectKind).toBe('intake_address');
    });
  });
});
