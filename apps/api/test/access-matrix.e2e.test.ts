import { AccessLevel, EnvironmentKind, Section, SubjectKind } from '@cairn/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/auth/password.service';
import { DATABASE } from '../src/db/db.module';
import { chronicleEntries, environments, grants, projects, subjects, users } from '../src/db/schema';
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

  /** Входит подрядчиком и возвращает агент с cookie сессии. */
  async function signIn() {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/login')
      .send({ email: 'user@cairn.local', password: 'очень длинный пароль' })
      .expect(200);

    return agent;
  }

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

    return signIn();
  }

  /** Выдаёт уровень на указанную секцию и входит. */
  async function signInWithSection(section: Section, level: AccessLevel | null) {
    if (level) {
      await testDb.db.insert(grants).values({
        subjectId: contractorSubjectId,
        projectId,
        section,
        level,
        grantedBy: adminUserId,
      });
    }

    return signIn();
  }

  /** Выдаёт уровень на секцию «Инфраструктура» и входит. */
  async function signInAsInfrastructure(level: AccessLevel | null) {
    return signInWithSection(Section.Infrastructure, level);
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

  /**
   * Инфраструктура (ТЗ 4.3, строка «Инфраструктура»).
   *
   * Отличается от «Инфо» тем, что уровень метаданных скрывает не весь
   * объект, а его часть: список окружений виден, серверные параметры — нет.
   */
  describe.each([
    { level: null, list: 404, create: 404, seesIp: false },
    { level: AccessLevel.Metadata, list: 200, create: 403, seesIp: false },
    { level: AccessLevel.Read, list: 200, create: 403, seesIp: true },
    { level: AccessLevel.Write, list: 200, create: 201, seesIp: true },
  ])('инфраструктура на уровне $level', ({ level, list, create, seesIp }) => {
    beforeEach(async () => {
      // Окружение заводится напрямую до выдачи уровня: проверяется
      // видимость существующих данных, а не право их создать.
      await testDb.db.insert(environments).values({
        projectId,
        name: 'Прод',
        kind: EnvironmentKind.Production,
        ip: '203.0.113.10',
      });
    });

    it(`отдаёт список кодом ${list}`, async () => {
      const agent = await signInAsInfrastructure(level);

      await agent.get(`/projects/${projectId}/environments`).expect(list);
    });

    it(`${seesIp ? 'показывает' : 'скрывает'} серверные параметры`, async () => {
      const agent = await signInAsInfrastructure(level);

      const response = await agent.get(`/projects/${projectId}/environments`);

      if (list !== 200) {
        expect(response.body.ip).toBeUndefined();

        return;
      }

      expect(response.body[0]?.ip !== undefined).toBe(seesIp);
    });

    it(`создание отвечает кодом ${create}`, async () => {
      const agent = await signInAsInfrastructure(level);

      await agent
        .post(`/projects/${projectId}/environments`)
        .send({ name: 'Стейдж', kind: EnvironmentKind.Staging })
        .expect(create);
    });
  });

  /**
   * Хроника (ТЗ 4.3, строка «Хроника»).
   *
   * Метаданные — «даты и заголовки событий»; содержимое сводки
   * открывается уровнем чтения, правка — уровнем записи.
   */
  describe.each([
    { level: null, list: 404, create: 404, seesContent: false },
    { level: AccessLevel.Metadata, list: 200, create: 403, seesContent: false },
    { level: AccessLevel.Read, list: 200, create: 403, seesContent: true },
    { level: AccessLevel.Write, list: 200, create: 201, seesContent: true },
  ])('хроника на уровне $level', ({ level, list, create, seesContent }) => {
    beforeEach(async () => {
      // Запись заводится напрямую до выдачи уровня: проверяется
      // видимость существующих данных, а не право их создать.
      await testDb.db.insert(chronicleEntries).values({
        projectId,
        occurredOn: '2026-08-27',
        title: 'Встреча',
        content: 'Содержимое сводки',
        createdBySubjectId: contractorSubjectId,
      });
    });

    it(`отдаёт ленту кодом ${list}`, async () => {
      const agent = await signInWithSection(Section.Chronicle, level);

      await agent.get(`/projects/${projectId}/chronicle`).expect(list);
    });

    it(`${seesContent ? 'показывает' : 'скрывает'} содержимое`, async () => {
      const agent = await signInWithSection(Section.Chronicle, level);

      const response = await agent.get(`/projects/${projectId}/chronicle`);

      if (list !== 200) {
        expect(response.body.content).toBeUndefined();

        return;
      }

      expect(response.body[0]?.content !== undefined).toBe(seesContent);
    });

    it(`создание отвечает кодом ${create}`, async () => {
      const agent = await signInWithSection(Section.Chronicle, level);

      await agent
        .post(`/projects/${projectId}/chronicle`)
        .send({ occurredOn: '2026-08-27', title: 'Новая', content: 'Текст' })
        .expect(create);
    });
  });

  /**
   * Переменные (ТЗ 4.3, строка «Переменные»).
   *
   * Уникальность секции: список одинаков на всех уровнях и никогда
   * не содержит значений; раскрытие — отдельное действие уровня чтения.
   */
  describe.each([
    { level: null, list: 404, reveal: 404, create: 404 },
    { level: AccessLevel.Metadata, list: 200, reveal: 403, create: 403 },
    { level: AccessLevel.Read, list: 200, reveal: 201, create: 403 },
    { level: AccessLevel.Write, list: 200, reveal: 201, create: 201 },
  ])('переменные на уровне $level', ({ level, list, reveal, create }) => {
    let environmentId: string;
    let variableId: string;

    beforeEach(async () => {
      const [environment] = await testDb.db
        .insert(environments)
        .values({ projectId, name: 'Прод', kind: EnvironmentKind.Production })
        .returning();
      environmentId = environment!.id;

      // Переменная заводится суперадмином по HTTP: значение обязано
      // пройти через штатное шифрование, а не лечь в базу открытым.
      const adminAgent = request.agent(app.getHttpServer());
      await adminAgent
        .post('/auth/login')
        .send({ email: 'admin@cairn.local', password: 'очень длинный пароль' })
        .expect(200);
      const created = await adminAgent
        .post(`/projects/${projectId}/environments/${environmentId}/variables`)
        .send({ key: 'DATABASE_URL', value: 'postgres://secret' })
        .expect(201);
      variableId = created.body.id;
    });

    it(`отдаёт список кодом ${list}`, async () => {
      const agent = await signInWithSection(Section.Variables, level);

      await agent
        .get(`/projects/${projectId}/environments/${environmentId}/variables`)
        .expect(list);
    });

    it('список не содержит значения ни на одном уровне', async () => {
      const agent = await signInWithSection(Section.Variables, level);

      const response = await agent.get(
        `/projects/${projectId}/environments/${environmentId}/variables`,
      );

      expect(JSON.stringify(response.body)).not.toContain('postgres://secret');
    });

    it(`раскрытие отвечает кодом ${reveal}`, async () => {
      const agent = await signInWithSection(Section.Variables, level);

      await agent
        .post(
          `/projects/${projectId}/environments/${environmentId}/variables/${variableId}/reveal`,
        )
        .expect(reveal);
    });

    it(`создание отвечает кодом ${create}`, async () => {
      const agent = await signInWithSection(Section.Variables, level);

      await agent
        .post(`/projects/${projectId}/environments/${environmentId}/variables`)
        .send({ key: 'NEW_KEY', value: 'x' })
        .expect(create);
    });
  });

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
