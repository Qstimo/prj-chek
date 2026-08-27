import { SubjectKind } from '@cairn/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthModule } from '../src/auth/auth.module';
import { PasswordService } from '../src/auth/password.service';
import { SESSION_COOKIE } from '../src/auth/session.cookie';
import { DATABASE } from '../src/db/db.module';
import { subjects, users } from '../src/db/schema';
import { startTestDatabase, type TestDatabase } from './db-fixture';

describe('аутентификация по HTTP', () => {
  let testDb: TestDatabase;
  let app: INestApplication;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const moduleRef = await Test.createTestingModule({ imports: [AuthModule] })
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

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();

    await testDb.db.insert(users).values({
      subjectId: subject!.id,
      email: 'user@cairn.local',
      passwordHash: await new PasswordService().hash('очень длинный пароль'),
    });
  });

  it('ставит cookie при успешном входе', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'user@cairn.local', password: 'очень длинный пароль' })
      .expect(200);

    const cookies = response.headers['set-cookie'] as unknown as string[];

    expect(cookies.some((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))).toBe(true);
  });

  it('делает cookie недоступной скриптам', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'user@cairn.local', password: 'очень длинный пароль' })
      .expect(200);

    const cookies = response.headers['set-cookie'] as unknown as string[];
    const session = cookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));

    expect(session).toContain('HttpOnly');
    expect(session).toContain('SameSite=Lax');
  });

  it('отвечает 401 при неверном пароле', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'user@cairn.local', password: 'не тот' })
      .expect(401);
  });

  it('отвечает 400 при некорректном теле запроса', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'не адрес', password: '' })
      .expect(400);
  });

  it('не пускает на защищённый маршрут без cookie', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('пускает на защищённый маршрут с cookie', async () => {
    const agent = request.agent(app.getHttpServer());

    await agent
      .post('/auth/login')
      .send({ email: 'user@cairn.local', password: 'очень длинный пароль' })
      .expect(200);

    const response = await agent.get('/auth/me').expect(200);

    expect(response.body).toMatchObject({ label: 'user@cairn.local', isSuperadmin: false });
  });

  it('закрывает доступ после выхода', async () => {
    const agent = request.agent(app.getHttpServer());

    await agent
      .post('/auth/login')
      .send({ email: 'user@cairn.local', password: 'очень длинный пароль' })
      .expect(200);
    await agent.post('/auth/logout').expect(204);

    await agent.get('/auth/me').expect(401);
  });
});
