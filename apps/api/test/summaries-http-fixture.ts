import {
  AccessLevel,
  SERVICE_AUDIO_TYPES,
  Section,
  SubjectKind,
  ModelServicePlacement,
  TranscriberKind,
  UPLOAD_TYPES,
} from '@cairn/shared';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, vi } from 'vitest';

import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/auth/password.service';
import { DATABASE } from '../src/db/db.module';
import { grants, projects, subjects, users } from '../src/db/schema';
import {
  TASK_SUGGESTER_SOURCE,
  type TaskSuggester,
  type TaskSuggesterSource,
} from '../src/summaries/suggester/task-suggester';
import { AUDIO_EXTRACTOR, type AudioExtractor } from '../src/summaries/transcription/extractor';
import { RECORDINGS_DIR_ENV } from '../src/summaries/transcription/recording-store';
import {
  TRANSCRIBER,
  type Transcriber,
  type TranscriptionAnswer,
} from '../src/summaries/transcription/transcriber';
import { startTestDatabase, type TestDatabase } from './db-fixture';

/**
 * Порт расшифровки в HTTP-тестах: ни один из них не ходит в сеть.
 *
 * Подменяется **токен**, а не настройка окружения: иначе `canExtract`
 * зависел бы от того, установлен ли `ffmpeg` на машине разработчика, и тест
 * про сужение списка форматов был бы зелёным у одного и красным у другого.
 */
class FixtureTranscriber implements Transcriber {
  readonly kind = TranscriberKind.External;
  readonly model = 'general';
  readonly host = 'stt.api.cloud.yandex.net';
  readonly maxSendBytes = 41_943_040;
  readonly serviceTypes = [...SERVICE_AUDIO_TYPES];
  /** Переключается тестом: установка без ключа остаётся рабочей. */
  isEnabled = true;

  async start(): Promise<TranscriptionAnswer> {
    throw new Error('служба в HTTP-тестах не вызывается');
  }

  async poll(): Promise<TranscriptionAnswer> {
    throw new Error('служба в HTTP-тестах не вызывается');
  }

  async forget(): Promise<void> {
    return undefined;
  }
}

/** Порт извлечения: ни один тест не запускает `ffmpeg`. */
class FixtureExtractor implements AudioExtractor {
  /** Переключается тестом: установка без `ffmpeg` рабочая, только уже. */
  hasFfmpeg = true;

  get isAvailable(): boolean {
    return this.hasFfmpeg;
  }

  get bitrate(): string | null {
    return this.hasFfmpeg ? '24k' : null;
  }

  get acceptedTypes(): string[] {
    return this.hasFfmpeg ? [...UPLOAD_TYPES] : [...SERVICE_AUDIO_TYPES];
  }

  async probe(): Promise<never> {
    throw new Error('извлечение в HTTP-тестах не вызывается');
  }

  async extract(): Promise<never> {
    throw new Error('извлечение в HTTP-тестах не вызывается');
  }
}

/** Настоящие сессии и база: проверяем маршруты вместе с регистрацией в корне. */
export function summariesHttpFixture() {
  let db: TestDatabase;
  let app: INestApplication;
  let passwordHash: string;
  const state = { projectId: '', otherProjectId: '', memberId: '', adminUserId: '' };
  const suggester: TaskSuggester & { suggest: ReturnType<typeof vi.fn> } = {
    placement: ModelServicePlacement.Local, model: 'тест', host: 'llm.internal', maxChars: 40_000,
    // `probe` заглушкой: ни один тест не ходит в сеть, и проверка связи
    // этих маршрутов не касается — она живёт в администрировании.
    isEnabled: true, suggest: vi.fn(), probe: vi.fn(),
  };
  /** Источник заглушки: подменяется токен источника, а не адаптера. */
  const suggesterSource: TaskSuggesterSource = { current: async () => suggester };
  const transcriber = new FixtureTranscriber();
  const extractor = new FixtureExtractor();
  let recordingsDir = '';
  beforeAll(async () => {
    db = await startTestDatabase();
    passwordHash = await new PasswordService().hash('очень длинный пароль');
    // Том записей — временный каталог: настоящих медиафайлов нет ни
    // одного, а те, что появляются, собраны из байтов в самом тесте.
    recordingsDir = await mkdtemp(join(tmpdir(), 'cairn-recordings-'));
    process.env[RECORDINGS_DIR_ENV] = recordingsDir;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE).useValue(db.db)
      .overrideProvider(TASK_SUGGESTER_SOURCE).useValue(suggesterSource)
      .overrideProvider(TRANSCRIBER).useValue(transcriber)
      .overrideProvider(AUDIO_EXTRACTOR).useValue(extractor).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    await db?.stop();
    delete process.env[RECORDINGS_DIR_ENV];
    await rm(recordingsDir, { recursive: true, force: true }).catch(() => undefined);
  });
  beforeEach(async () => {
    await db.truncate();
    suggester.suggest.mockReset();
    suggester.suggest.mockResolvedValue({ tasks: [{ title: 'Предложенная задача' }], dropped: 0 });
    transcriber.isEnabled = true;
    extractor.hasFfmpeg = true;
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
    state, suggester, transcriber, extractor,
    /** Каталог записей: тест кладёт в него дорожку своими байтами. */
    recordingsDir: () => recordingsDir,
    /** База полными правами: ею доводятся состояния, которых нет ручки. */
    db: () => db,
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

