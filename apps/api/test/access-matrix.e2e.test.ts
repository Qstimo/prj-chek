import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/auth/password.service';
import { DATABASE } from '../src/db/db.module';
import { grants, projects, subjects, users } from '../src/db/schema';
import { startTestDatabase, type TestDatabase } from './db-fixture';

/** Ожидаемый ответ для уровня доступа. */
interface Expectation {
  /** Уровень доступа к секции «Инфо»; `null` — выдачи нет. */
  level: AccessLevel | null;
  /** Ожидаемый код при чтении карточки. */
  read: number;
  /** Ожидаемый код при правке. */
  write: number;
  /** Видно ли проект в списке. */
  listed: boolean;
}

/**
 * Таблица из раздела 4.3 ТЗ в исполняемом виде.
 *
 * Каждая строка — сочетание уровня доступа и ожидаемого поведения.
 * Добавление секции на следующих этапах добавляет сюда столбцы,
 * а не переписывает логику.
 */
const MATRIX: Expectation[] = [
  { level: null, read: 404, write: 404, listed: false },
  { level: AccessLevel.Metadata, read: 200, write: 403, listed: true },
  { level: AccessLevel.Read, read: 200, write: 403, listed: true },
  { level: AccessLevel.Write, read: 200, write: 200, listed: true },
];

describe('матрица доступа', () => {
  let testDb: TestDatabase;
  let app: INestApplication;
  let projectId: string;
  let contractorSubjectId: string;
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

    const [contractorSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    contractorSubjectId = contractorSubject!.id;
    await testDb.db
      .insert(users)
      .values({ subjectId: contractorSubjectId, email: 'user@cairn.local', passwordHash });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект', purpose: 'Назначение' })
      .returning();
    projectId = project!.id;
  });

  async function signInAs(level: AccessLevel | null) {
    if (level) {
      await testDb.db.insert(grants).values({
        subjectId: contractorSubjectId,
        projectId,
        section: Section.Info,
        level,
        grantedBy: adminUserId,
      });
    }

    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/login')
      .send({ email: 'user@cairn.local', password: 'очень длинный пароль' })
      .expect(200);

    return agent;
  }

  for (const expectation of MATRIX) {
    const title = expectation.level ?? 'нет доступа';

    describe(`уровень «${title}»`, () => {
      it(`чтение карточки отвечает ${expectation.read}`, async () => {
        const agent = await signInAs(expectation.level);

        await agent.get(`/projects/${projectId}`).expect(expectation.read);
      });

      it(`правка отвечает ${expectation.write}`, async () => {
        const agent = await signInAs(expectation.level);

        await agent
          .patch(`/projects/${projectId}`)
          .send({ name: 'Новое имя' })
          .expect(expectation.write);
      });

      it(`проект ${expectation.listed ? 'виден' : 'не виден'} в списке`, async () => {
        const agent = await signInAs(expectation.level);

        const response = await agent.get('/projects').expect(200);

        expect(response.body).toHaveLength(expectation.listed ? 1 : 0);
      });

      it('управление доступами закрыто', async () => {
        // Уровень доступа к проекту не даёт права управлять выдачами (спека 4.3).
        const agent = await signInAs(expectation.level);

        await agent.get(`/projects/${projectId}/grants`).expect(403);
      });

      it('журнал закрыт', async () => {
        const agent = await signInAs(expectation.level);

        await agent.get('/audit').expect(403);
      });

      it('список пользователей закрыт', async () => {
        const agent = await signInAs(expectation.level);

        await agent.get('/users').expect(403);
      });
    });
  }

  describe('проекция полей', () => {
    it('на уровне метаданных назначение скрыто', async () => {
      const agent = await signInAs(AccessLevel.Metadata);

      const response = await agent.get(`/projects/${projectId}`).expect(200);

      expect(response.body).not.toHaveProperty('purpose');
    });

    it('на уровне чтения назначение видно', async () => {
      const agent = await signInAs(AccessLevel.Read);

      const response = await agent.get(`/projects/${projectId}`).expect(200);

      expect(response.body).toMatchObject({ purpose: 'Назначение' });
    });
  });
});
