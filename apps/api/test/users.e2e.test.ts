import { SubjectKind } from '@cairn/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthModule } from '../src/auth/auth.module';
import { PasswordService } from '../src/auth/password.service';
import { DATABASE } from '../src/db/db.module';
import { InvitationsModule } from '../src/invitations/invitations.module';
import { UsersModule } from '../src/users/users.module';
import { subjects, users } from '../src/db/schema';
import { startTestDatabase, type TestDatabase } from './db-fixture';

describe('пользователи по HTTP', () => {
  let testDb: TestDatabase;
  let app: INestApplication;
  let targetUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule, UsersModule, InvitationsModule],
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
    await testDb.db.insert(users).values({
      subjectId: adminSubject!.id,
      email: 'admin@cairn.local',
      passwordHash,
      isSuperadmin: true,
    });

    const [targetSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    const [target] = await testDb.db
      .insert(users)
      .values({ subjectId: targetSubject!.id, email: 'user@cairn.local', passwordHash })
      .returning();
    targetUserId = target!.id;
  });

  async function signIn(email: string) {
    const agent = request.agent(app.getHttpServer());

    await agent.post('/auth/login').send({ email, password: 'очень длинный пароль' }).expect(200);

    return agent;
  }

  it('суперадмин видит список пользователей', async () => {
    const admin = await signIn('admin@cairn.local');

    const response = await admin.get('/users').expect(200);

    expect(response.body).toHaveLength(2);
  });

  it('в списке нет секретов', async () => {
    // Секреты не попадают в общие ответы списков (ТЗ 9).
    const admin = await signIn('admin@cairn.local');

    const response = await admin.get('/users').expect(200);

    expect(JSON.stringify(response.body)).not.toContain('argon2');
    expect(response.body[0]).not.toHaveProperty('passwordHash');
  });

  it('обычному пользователю отказывает с кодом 403', async () => {
    const user = await signIn('user@cairn.local');

    await user.get('/users').expect(403);
  });

  it('суперадмин приглашает и получает ссылку', async () => {
    const admin = await signIn('admin@cairn.local');

    const response = await admin
      .post('/invitations')
      .send({ email: 'new@cairn.local' })
      .expect(201);

    expect(response.body.url).toContain('/invite/');
  });

  it('отклоняет приглашение действующего пользователя', async () => {
    const admin = await signIn('admin@cairn.local');

    await admin.post('/invitations').send({ email: 'user@cairn.local' }).expect(409);
  });

  it('сброс пароля закрывает доступ пользователю', async () => {
    const admin = await signIn('admin@cairn.local');
    const user = await signIn('user@cairn.local');

    await admin.post(`/users/${targetUserId}/reset-password`).expect(201);

    await user.get('/auth/me').expect(401);
  });

  it('отзыв закрывает доступ пользователю', async () => {
    const admin = await signIn('admin@cairn.local');
    const user = await signIn('user@cairn.local');

    await admin.post(`/users/${targetUserId}/revoke`).expect(204);

    await user.get('/auth/me').expect(401);
  });

  it('приём ссылки без второго фактора выдаёт сессию', async () => {
    const admin = await signIn('admin@cairn.local');
    const invitation = await admin
      .post('/invitations')
      .send({ email: 'new@cairn.local' })
      .expect(201);

    const token = String(invitation.body.url).split('/invite/')[1];
    const guest = request.agent(app.getHttpServer());

    const response = await guest
      .post(`/invitations/${token}/accept`)
      .send({ password: 'очень длинный пароль' })
      .expect(200);

    expect(response.body).toMatchObject({ kind: 'session' });
    await guest.get('/auth/me').expect(200);
  });
});
