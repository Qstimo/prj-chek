import { AccessLevel, Section, SubjectKind, ModelServicePlacement } from '@cairn/shared';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, vi } from 'vitest';

import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/auth/password.service';
import { DATABASE } from '../src/db/db.module';
import { grants, projects, subjects, users } from '../src/db/schema';
import { TASK_SUGGESTER, type TaskSuggester } from '../src/summaries/suggester/task-suggester';
import { startTestDatabase, type TestDatabase } from './db-fixture';

/** Настоящие сессии и база: проверяем маршруты вместе с регистрацией в корне. */
export function summariesHttpFixture() {
  let db: TestDatabase;
  let app: INestApplication;
  let passwordHash: string;
  const state = { projectId: '', otherProjectId: '', memberId: '', adminUserId: '' };
  const suggester: TaskSuggester & { suggest: ReturnType<typeof vi.fn> } = {
    placement: ModelServicePlacement.Local, model: 'тест', host: 'llm.internal', maxChars: 40_000,
    isEnabled: true, suggest: vi.fn(),
  };
  beforeAll(async () => {
    db = await startTestDatabase();
    passwordHash = await new PasswordService().hash('очень длинный пароль');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE).useValue(db.db)
      .overrideProvider(TASK_SUGGESTER).useValue(suggester).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });
  beforeEach(async () => {
    await db.truncate();
    suggester.suggest.mockReset();
    suggester.suggest.mockResolvedValue({ tasks: [{ title: 'Предложенная задача' }], dropped: 0 });
    for (const [email, isSuperadmin] of [['admin@cairn.local', true], ['user@cairn.local', false]] as const) {
      const [subject] = await db.db.insert(subjects).values({ kind: SubjectKind.User, label: email }).returning();
      const [user] = await db.db.insert(users).values({ subjectId: subject!.id, email, passwordHash, isSuperadmin }).returning();
      if (isSuperadmin) state.adminUserId = user!.id;
      else state.memberId = subject!.id;
    }
    const rows = await db.db.insert(projects).values([
      { slug: 'proekt', name: 'Проект' }, { slug: 'drugoj', name: 'Другой' },
    ]).returning();
    state.projectId = rows[0]!.id;
    state.otherProjectId = rows[1]!.id;
  });
  return {
    state, suggester,
    anonymous: () => request(app.getHttpServer()),
    async signIn(email = 'admin@cairn.local') {
      const agent = request.agent(app.getHttpServer());
      await agent.post('/auth/login').send({ email, password: 'очень длинный пароль' }).expect(200);
      return agent;
    },
    async grant(section: Section, level: AccessLevel, projectId = state.projectId) {
      await db.db.insert(grants).values({ subjectId: state.memberId, projectId, section, level, grantedBy: state.adminUserId });
    },
  };
}

/** Базовый текст: тесты ошибок меняют только проверяемое поле. */
export const SUMMARY_BODY = { title: 'Созвон', occurredOn: '2026-11-16', text: 'Решили сделать задачу' };

