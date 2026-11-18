import {
  AccessLevel,
  EXTRACTION_FAILED,
  EXTRACTION_TIMED_OUT,
  RECORDING_NO_AUDIO_TRACK,
  Section,
  SubjectKind,
  TRANSCRIBER_UNAVAILABLE,
  TRANSCRIPTION_CANCELLED,
  TRANSCRIPTION_EMPTY,
  TRANSCRIPTION_INTERRUPTED,
  TRANSCRIPTION_TIMED_OUT,
  TranscriberKind,
  TranscriptionState,
} from '@cairn/shared';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../../access/access.service';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/audit.types';
import { ChronicleRepository } from '../../chronicle/chronicle.repository';
import {
  auditLog,
  chronicleEntries,
  grants,
  projects,
  subjects,
  transcriptionJobs,
  users,
  type TranscriptionJobRow,
} from '../../db/schema';
import { RoadmapRepository } from '../../roadmap/roadmap.repository';
import { startTestDatabase, type TestDatabase } from '../../../test/db-fixture';
import { SummariesRepository } from '../summaries.repository';
import {
  ExtractionFailure,
  type AudioExtractor,
  type ExtractedAudio,
  type MediaProbe,
} from './extractor';
import { RecordingStore } from './recording-store';
import { TRANSCRIPTION_POLL_ENV } from './settings';
import {
  TranscriberFailure,
  type Transcriber,
  type TranscriptionAnswer,
  type TranscriptionInput,
} from './transcriber';
import { TranscriptionRepository } from './transcription.repository';
import {
  TranscriptionRunOutcome,
  TranscriptionRunnerService,
} from './transcription-runner.service';
import { TranscriptionService } from './transcription.service';

/** Размер дорожки: единицы мегабайт после извлечения (дизайн, 3.6). */
const AUDIO_BYTES = 11_534_336;

/** Размер загруженного: полгигабайта видео. */
const UPLOAD_BYTES = 566_231_040;

/** Ключ службы: в журнале его нет ни при каких условиях. */
const API_KEY = 'секретный-ключ';

/** Пауза, по которой видно, что остановка правда ждала тик. */
function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });
}

/** Хранилище без диска: тик проверяется по вызовам, а не по файлам. */
class StubStore extends RecordingStore {
  readonly saved = new Set<string>();
  readonly removed: string[] = [];

  override async remove(relativePath: string): Promise<void> {
    this.removed.push(relativePath);
    this.saved.delete(relativePath);
  }
}

/** Заглушка порта расшифровки: ни один тест не ходит в сеть. */
class StubTranscriber implements Transcriber {
  readonly kind = TranscriberKind.External;
  readonly model = 'general';
  readonly host = 'stt.api.cloud.yandex.net';
  readonly maxSendBytes = 41_943_040;
  readonly serviceTypes = ['audio/mpeg', 'audio/ogg', 'audio/wav'];
  readonly isEnabled = true;
  /** Ключ лежит в адаптере и наружу не выходит: это и проверяется. */
  readonly apiKey = API_KEY;

  started = 0;
  polled = 0;
  readonly forgotten: string[] = [];
  readonly sent: TranscriptionInput[] = [];

  startFails = false;
  pollFails = false;
  forgetFails = false;
  emptyText = false;
  /** Отвечать сразу готовым текстом, а не `running`. */
  answerDone = true;
  /** Что сделать в момент начала передачи — до того, как уйдёт байт. */
  onStart: (() => void | Promise<void>) | null = null;
  /** Задержка передачи: по ней видно, ждёт ли остановка её конца. */
  holdMs = 0;

  constructor(private readonly order: string[]) {}

  async start(input: TranscriptionInput, _signal: AbortSignal): Promise<TranscriptionAnswer> {
    this.order.push('send');
    this.started += 1;
    this.sent.push(input);

    await this.onStart?.();

    if (this.holdMs > 0) {
      await pause(this.holdMs);
    }

    if (this.startFails) {
      throw new TranscriberFailure(TRANSCRIBER_UNAVAILABLE, 'Служба не ответила: 502 Bad Gateway');
    }

    if (!this.answerDone) {
      return {
        state: TranscriptionState.Running,
        text: null,
        code: null,
        externalId: 'операция-1',
      };
    }

    return this.answer();
  }

  async poll(externalId: string, _signal: AbortSignal): Promise<TranscriptionAnswer> {
    this.order.push('poll');
    this.polled += 1;

    if (this.pollFails) {
      throw new TranscriberFailure(TRANSCRIBER_UNAVAILABLE, 'Опрос не ответил: 504');
    }

    return { ...this.answer(), externalId };
  }

  async forget(externalId: string): Promise<void> {
    if (this.forgetFails) {
      throw new TranscriberFailure(TRANSCRIBER_UNAVAILABLE, 'Забыть не вышло');
    }

    this.forgotten.push(externalId);
  }

  /** Один и тот же ответ на передачу и на опрос: пустой текст — не успех. */
  private answer(): TranscriptionAnswer {
    if (this.emptyText) {
      return { state: TranscriptionState.Done, text: '   ', code: null, externalId: null };
    }

    return {
      state: TranscriptionState.Done,
      text: 'Обсудили сроки.',
      code: null,
      externalId: null,
    };
  }
}

/** Заглушка порта извлечения: ни один тест не запускает `ffmpeg`. */
class StubExtractor implements AudioExtractor {
  readonly isAvailable = true;
  readonly bitrate = '24k';
  readonly acceptedTypes = ['audio/mpeg', 'video/mp4'];

  extracted = 0;
  probed = 0;
  aborted = false;
  hasAudio = true;
  failWith: string | null = null;
  /** Что убрали к моменту запуска: сторож уборки недописанного выхода. */
  seenRemoved: string[] = [];
  /** Что сделать, пока «идёт» извлечение. */
  onExtract: (() => void | Promise<void>) | null = null;
  /** Держать процесс, пока его не убьют сигналом. */
  holdUntilAborted = false;

  constructor(
    private readonly order: string[],
    private readonly store: StubStore,
  ) {}

  async probe(_uploadPath: string, _signal: AbortSignal): Promise<MediaProbe> {
    this.probed += 1;

    return {
      hasAudio: this.hasAudio,
      audioCodec: this.hasAudio ? 'aac' : null,
      durationSeconds: 3600,
    };
  }

  async extract(_uploadPath: string, jobId: string, signal: AbortSignal): Promise<ExtractedAudio> {
    this.order.push('extract');
    this.extracted += 1;
    this.seenRemoved = [...this.store.removed];

    await this.onExtract?.();

    if (this.failWith) {
      throw new ExtractionFailure(this.failWith, 'Не удалось извлечь звуковую дорожку');
    }

    if (this.holdUntilAborted) {
      await new Promise<void>((_resolve, reject) => {
        const kill = (): void => {
          // Так ведёт себя настоящий `ffmpeg`, убитый сигналом: исход
          // классифицируется как предел времени.
          this.aborted = true;
          reject(new ExtractionFailure(EXTRACTION_TIMED_OUT, 'Процесс убит'));
        };

        // Уже оборванный сигнал обязан убить сразу, а не ждать события,
        // которого больше не будет: `spawn` ведёт себя именно так, и
        // заглушка, ждущая события, повисла бы на гонке «остановка успела
        // раньше запуска».
        if (signal.aborted) {
          kill();

          return;
        }

        signal.addEventListener('abort', kill);
      });
    }

    const path = this.store.audioNameOf(jobId);

    this.store.saved.add(path);

    return { path, bytes: AUDIO_BYTES, type: 'audio/ogg' };
  }
}

describe('прогон расшифровок', () => {
  let testDb: TestDatabase;
  let store: StubStore;
  let repository: TranscriptionRepository;
  let service: TranscriptionService;
  let transcriber: StubTranscriber;
  let extractor: StubExtractor;
  let order: string[];
  let projectId: string;
  let subjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();
    delete process.env[TRANSCRIPTION_POLL_ENV];

    const access = new AccessService(testDb.db);
    const chronicle = new ChronicleRepository(testDb.db, access);

    order = [];
    store = new StubStore();
    transcriber = new StubTranscriber(order);
    extractor = new StubExtractor(order, store);
    repository = new TranscriptionRepository(testDb.db, access);
    service = new TranscriptionService(
      testDb.db,
      repository,
      new SummariesRepository(testDb.db, access, chronicle, new RoadmapRepository(testDb.db, access)),
      chronicle,
      new AuditService(),
      store,
      transcriber,
      extractor,
    );

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    const [admin] = await testDb.db
      .insert(users)
      .values({
        subjectId: adminSubject!.id,
        email: 'admin@cairn.local',
        passwordHash: 'хэш',
        isSuperadmin: true,
      })
      .returning();
    adminUserId = admin!.id;

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    subjectId = subject!.id;
    await testDb.db
      .insert(users)
      .values({ subjectId, email: 'user@cairn.local', passwordHash: 'хэш' });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;

    await testDb.db.insert(grants).values({
      subjectId,
      projectId,
      section: Section.Chronicle,
      level: AccessLevel.Write,
      grantedBy: adminUserId,
    });
  });

  afterEach(async () => {
    delete process.env[TRANSCRIPTION_POLL_ENV];
  });

  /**
   * Прогон на двух соединениях: замок — своим.
   *
   * Замок держит соединение на весь тик, а рабочий пул фикстуры состоит из
   * единственного соединения: занять его значило бы запереть сам прогон.
   */
  function runner(): TranscriptionRunnerService {
    return new TranscriptionRunnerService(
      testDb.appDb,
      testDb.db,
      repository,
      service,
      new AuditService(),
      store,
      transcriber,
      extractor,
    );
  }

  /** Задача с готовой дорожкой: следующий шаг — передача наружу. */
  async function seed(overrides: Partial<TranscriptionJobRow> = {}): Promise<TranscriptionJobRow> {
    const id = randomUUID();
    const [row] = await testDb.db
      .insert(transcriptionJobs)
      .values({
        id,
        projectId,
        requestedBySubjectId: subjectId,
        transcriber: TranscriberKind.External,
        model: 'general',
        occurredOn: '2026-11-17',
        title: 'Созвон по релизу',
        uploadPath: `${id}.mp4`,
        uploadBytes: UPLOAD_BYTES,
        uploadType: 'video/mp4',
        audioPath: `${id}.opus`,
        audioBytes: AUDIO_BYTES,
        audioType: 'audio/ogg',
        ...overrides,
      })
      .returning();

    store.saved.add(`${id}.mp4`);

    if (row!.audioPath) {
      store.saved.add(row!.audioPath);
    }

    return row!;
  }

  /** Задача, которой дорожку ещё предстоит извлечь. */
  async function seedForExtraction(
    overrides: Partial<TranscriptionJobRow> = {},
  ): Promise<TranscriptionJobRow> {
    return seed({ audioPath: null, audioBytes: null, audioType: null, ...overrides });
  }

  /** Задача у провайдера: опрашивать есть чем. */
  async function seedRunning(count: number): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      await seed({
        state: TranscriptionState.Running,
        externalId: `операция-${index + 1}`,
        sentAt: new Date(),
      });
    }
  }

  async function rowOf(jobId: string): Promise<TranscriptionJobRow> {
    const [row] = await testDb.db
      .select()
      .from(transcriptionJobs)
      .where(eq(transcriptionJobs.id, jobId));

    return row!;
  }

  async function entriesOf(action: AuditAction): Promise<(typeof auditLog.$inferSelect)[]> {
    return testDb.db.select().from(auditLog).where(eq(auditLog.action, action));
  }

  describe('передача наружу', () => {
    it('пишет в журнал передачу до первого байта', async () => {
      // Нет записи — нет и передачи. В записи созвона есть всё сказанное,
      // включая то, чего в саммари нет.
      let seenBeforeByte: string[] = [];

      await seed();
      transcriber.onStart = async () => {
        seenBeforeByte = (await entriesOf(AuditAction.SummaryTranscriptionRequested)).map(
          (entry) => String(entry.entityId),
        );
      };

      await runner().runAll();

      expect(transcriber.started).toBe(1);
      expect(seenBeforeByte).toHaveLength(1);
    });

    it('в записи журнала о передаче есть узел и нет ключа', async () => {
      await seed();

      await runner().runAll();

      const [entry] = await entriesOf(AuditAction.SummaryTranscriptionRequested);

      expect(entry?.metadata).toMatchObject({
        host: 'stt.api.cloud.yandex.net',
        dataLogging: false,
      });
      expect(JSON.stringify(await testDb.rowsOf(auditLog))).not.toContain(API_KEY);
    });

    it('в записи журнала о передаче назван размер дорожки, а не файла', async () => {
      // Наружу уходит дорожка; метаданные несут и то и другое, но на
      // вопрос «что покинуло машину» отвечает только `audioBytes`.
      await seed();

      await runner().runAll();

      const [entry] = await entriesOf(AuditAction.SummaryTranscriptionRequested);

      expect(entry?.metadata).toMatchObject({
        audioBytes: AUDIO_BYTES,
        audioType: 'audio/ogg',
        uploadBytes: UPLOAD_BYTES,
        extracted: true,
      });
    });

    it('наружу уходит дорожка, а загруженного файла порт не видит вовсе', async () => {
      const job = await seed();

      await runner().runAll();

      expect(transcriber.sent).toEqual([{ audioPath: job.audioPath, audioType: 'audio/ogg' }]);
    });

    it('передача без извлечения помечается в журнале отдельно', async () => {
      // `extracted: false` означает, что ушёл сам загруженный файл — ровно
      // тот, что лежит на томе.
      const id = randomUUID();

      // Та же строка пути в обеих колонках — ровно то, что означает
      // «извлечения не было»: файл один.
      await seed({
        id,
        uploadType: 'audio/mpeg',
        uploadPath: `${id}.mp3`,
        audioPath: `${id}.mp3`,
        audioType: 'audio/mpeg',
      });

      await runner().runAll();

      const [entry] = await entriesOf(AuditAction.SummaryTranscriptionRequested);

      expect(entry?.metadata).toMatchObject({ extracted: false });
    });

    it('отказ отправки закрывает задачу и пишет неудачу', async () => {
      const job = await seed();

      transcriber.startFails = true;

      await runner().runAll();

      expect((await rowOf(job.id)).state).toBe(TranscriptionState.Failed);
      expect((await rowOf(job.id)).failureCode).toBe(TRANSCRIBER_UNAVAILABLE);
      expect(await entriesOf(AuditAction.SummaryTranscriptionFailed)).toHaveLength(1);
    });

    it('в записи неудачи нет тела чужого ответа', async () => {
      await seed();
      transcriber.startFails = true;

      await runner().runAll();

      expect(JSON.stringify(await testDb.rowsOf(auditLog))).not.toContain('Bad Gateway');
    });

    it('ответ без текста закрывает задачу, а не создаёт пустое саммари', async () => {
      // Саммари рождается из текста, и пустого текста у записи хроники не
      // бывает: `content` — `notNull`, `min(1)`.
      const job = await seed();

      transcriber.emptyText = true;

      await runner().runAll();

      expect((await rowOf(job.id)).failureCode).toBe(TRANSCRIPTION_EMPTY);
      expect(await testDb.rowsOf(chronicleEntries)).toHaveLength(0);
    });

    it('ответ с операцией переводит задачу в running, а не закрывает', async () => {
      const job = await seed();

      transcriber.answerDone = false;

      await runner().runAll();

      const row = await rowOf(job.id);

      expect(row.state).toBe(TranscriptionState.Running);
      expect(row.externalId).toBe('операция-1');
      expect(row.sentAt).not.toBeNull();
    });
  });

  describe('порядок и бюджет тика', () => {
    it('делает не больше одного тяжёлого шага за тик', async () => {
      // Константа, а не настройка: число описывает ядро и память машины,
      // а переменная приглашала бы поставить десять.
      await seed();
      await seed();
      await seed();

      await runner().runAll();

      expect(transcriber.started + extractor.extracted).toBe(1);
    });

    it('извлечение и отправка делят один и тот же бюджет', async () => {
      // Это один ресурс, и бюджет, считающий его по частям, не бюджет.
      // Следствие: одна запись покидает машину за два тика.
      const job = await seedForExtraction();
      const first = runner();

      await first.runAll();

      expect(extractor.extracted).toBe(1);
      expect(transcriber.started).toBe(0);
      expect((await rowOf(job.id)).state).toBe(TranscriptionState.Queued);

      await first.runAll();

      expect(transcriber.started).toBe(1);
    });

    it('опрашивает все идущие за один тик', async () => {
      // Опрос тела не несёт и наружу ничего не раскрывает сверх уже
      // отправленного, значит места в бюджете не занимает.
      await seedRunning(5);

      await runner().runAll();

      expect(transcriber.polled).toBe(5);
    });

    it('опрос идёт прежде извлечения', async () => {
      // Порядок имеет цену: опрашивай после `ffmpeg`, и готовый у
      // провайдера текст лежал бы ещё столько, сколько длится чужое
      // перекодирование.
      await seedForExtraction();
      await seedRunning(1);

      await runner().runAll();

      expect(order).toEqual(['poll', 'extract']);
    });

    it('падение одной задачи не прерывает тик', async () => {
      // Как обход адресов не прерывается падением одного адреса.
      await seedRunning(2);
      transcriber.pollFails = true;

      await runner().runAll();

      expect(transcriber.polled).toBe(2);
    });

    it('второй тик при идущем первом не начинается', async () => {
      await seed();
      transcriber.holdMs = 30;

      const live = runner();
      const first = live.runAll();

      expect(await live.runAll()).toBe(TranscriptionRunOutcome.Busy);
      expect(await first).toBe(TranscriptionRunOutcome.Done);
    });

    it('занятый замок базы даёт Busy, а не ожидание', async () => {
      // В памяти замок не защитил бы от второго экземпляра API за прокси,
      // а два тика сразу — это две отправки одной записи наружу.
      let release = (): void => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const holding = testDb.db.transaction(async (tx) => {
        // Тот же ключ, что у прогона: класс «CAIRN» (0x4341_4952),
        // объект 2. Числом, а не константой из исходника, намеренно —
        // иначе сторож проверял бы совпадение с самим собой.
        await tx.execute(sql`select pg_advisory_xact_lock(1128352082, 2)`);
        await held;
      });

      try {
        expect(await runner().runAll()).toBe(TranscriptionRunOutcome.Busy);
      } finally {
        release();
        await holding;
      }

      expect(transcriber.started).toBe(0);
    });
  });

  describe('извлечение дорожки', () => {
    it('ставит extracting прежде запуска ffmpeg', async () => {
      // Захват работы: без него два тика двух экземпляров API запустили бы
      // два `ffmpeg` на один файл и писали бы в один и тот же выходной путь.
      const job = await seedForExtraction();
      let seen: TranscriptionState | null = null;

      extractor.onExtract = async () => {
        seen = (await rowOf(job.id)).state;
      };

      await runner().runAll();

      expect(seen).toBe(TranscriptionState.Extracting);
    });

    it('готовая дорожка возвращает задачу в очередь, а не отправляет сразу', async () => {
      const job = await seedForExtraction();

      await runner().runAll();

      const row = await rowOf(job.id);

      expect(row.state).toBe(TranscriptionState.Queued);
      expect(row.audioPath).toBe(`${job.id}.opus`);
      expect(row.audioBytes).toBe(AUDIO_BYTES);
      expect(transcriber.started).toBe(0);
    });

    it('отсутствие дорожки в файле — свой код, а не общее «не вышло»', async () => {
      // Человек по этому коду выгружает созвон заново со звуком, а по
      // `extraction_failed` просто нажимает «снова».
      const job = await seedForExtraction();

      extractor.hasAudio = false;

      await runner().runAll();

      expect((await rowOf(job.id)).failureCode).toBe(RECORDING_NO_AUDIO_TRACK);
      expect(extractor.extracted).toBe(0);
    });

    it('отказ извлечения закрывает задачу названным кодом', async () => {
      const job = await seedForExtraction();

      extractor.failWith = EXTRACTION_FAILED;

      await runner().runAll();

      const row = await rowOf(job.id);

      expect(row.state).toBe(TranscriptionState.Failed);
      expect(row.failureCode).toBe(EXTRACTION_FAILED);
    });

    it('отказ извлечения оставляет загруженный файл', async () => {
      // Отказ не повод терять то, что человек загрузил по медленному
      // каналу: повторная попытка должна быть из чего делать.
      const job = await seedForExtraction();

      extractor.failWith = EXTRACTION_FAILED;

      await runner().runAll();

      expect((await rowOf(job.id)).uploadPath).toBe(`${job.id}.mp4`);
      expect(store.saved.has(`${job.id}.mp4`)).toBe(true);
    });

    it('извлечение в журнал отдельной записью не пишется', async () => {
      // Наружу ничего не уходит, в проекте ничего не появляется, а исход
      // виден в строке задачи. Факт извлечения есть в журнале признаком
      // `extracted` у записи о передаче — там, где он что-то значит.
      await seedForExtraction();

      await runner().runAll();

      const actions = (await testDb.rowsOf(auditLog)).map((entry) => entry.action);

      expect(actions).not.toContain('summary.recording_extracted');
      expect(actions).toEqual([]);
    });

    it('отменённая во время извлечения задача в очередь не возвращается', async () => {
      // Отмена закрывает строку, а `ffmpeg` она не убивает — названная
      // граница. Без охраны перехода дошедшее до конца извлечение
      // вернуло бы закрытую задачу в очередь, и запись ушла бы наружу
      // после отмены.
      const job = await seedForExtraction();

      extractor.onExtract = async () => {
        await service.cancel(
          {
            id: subjectId,
            kind: SubjectKind.User,
            label: 'user@cairn.local',
            isSuperadmin: false,
            isRevoked: false,
          },
          projectId,
          job.id,
        );
      };

      await runner().runAll();

      const row = await rowOf(job.id);

      expect(row.state).toBe(TranscriptionState.Failed);
      expect(row.failureCode).toBe(TRANSCRIPTION_CANCELLED);
      expect(row.audioPath).toBeNull();
      // Дорожка, вышедшая у отменённой задачи, на томе не остаётся: её
      // никто не прочтёт, а место она занимает.
      expect(store.removed).toContain(`${job.id}.opus`);
    });
  });

  describe('укладка текста', () => {
    it('укладка текста уносит исходник, но не дорожку', async () => {
      const job = await seed();

      await runner().runAll();

      expect((await rowOf(job.id)).state).toBe(TranscriptionState.Done);
      expect(store.removed).toEqual([`${job.id}.mp4`]);
      expect(store.saved.has(`${job.id}.opus`)).toBe(true);
    });

    it('просит службу забыть результаты после укладки текста', async () => {
      // Результаты распознавания живут у провайдера 3 суток — это их
      // политика, и обойти её нельзя, но можно попросить убрать сразу.
      await seedRunning(1);

      await runner().runAll();

      expect(transcriber.forgotten).toEqual(['операция-1']);
    });

    it('отказ forget исхода не меняет', async () => {
      const job = await seed();

      transcriber.forgetFails = true;

      await runner().runAll();

      expect((await rowOf(job.id)).state).toBe(TranscriptionState.Done);
    });

    it('сбой опроса исходом не считается', async () => {
      // Таймаут у `GET /operations` ничего не говорит о судьбе работы:
      // провайдер считает дальше.
      await seedRunning(1);
      transcriber.pollFails = true;

      await runner().runAll();

      const [row] = await testDb.rowsOf(transcriptionJobs);

      expect(row?.state).toBe(TranscriptionState.Running);
      expect(await entriesOf(AuditAction.SummaryTranscriptionFailed)).toHaveLength(0);
    });

    it.each([
      ['отказ службы', (): void => void (transcriber.startFails = true)],
      ['отказ извлечения', (): void => void (extractor.failWith = EXTRACTION_FAILED)],
      ['пустая расшифровка', (): void => void (transcriber.emptyText = true)],
    ])('%s загруженный файл не уносит', async (_name, arrange) => {
      // Сторож главного довода решения об уборке исходника: он убирается
      // ровно на `done` и ни при чём другом (дизайн, 2.6 и 7.5).
      const job = await seedForExtraction();

      arrange();

      // Два тика: первый извлекает, второй отправляет — бюджет один.
      const live = runner();

      await live.runAll();
      await live.runAll();

      expect((await rowOf(job.id)).uploadPath).toBe(`${job.id}.mp4`);
      expect(store.removed).not.toContain(`${job.id}.mp4`);
    });

    it('таймаут расшифровки загруженный файл не уносит', async () => {
      const job = await seed({
        state: TranscriptionState.Running,
        externalId: 'операция-1',
        sentAt: new Date(),
        // Предел считается от приёма: три часа при умолчании в два.
        startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      });

      await runner().runAll();

      const row = await rowOf(job.id);

      expect(row.failureCode).toBe(TRANSCRIPTION_TIMED_OUT);
      expect(row.uploadPath).toBe(`${job.id}.mp4`);
      expect(transcriber.polled).toBe(0);
    });
  });

  describe('подъём приложения', () => {
    it('прерванная отправка закрывается неудачей, а не повторяется', async () => {
      // Исход неизвестен: отправить ещё раз значит передать созвон второй
      // раз и заплатить второй раз.
      const job = await seed({ state: TranscriptionState.Sending, sentAt: new Date() });

      await runner().runAll();

      expect((await rowOf(job.id)).failureCode).toBe(TRANSCRIPTION_INTERRUPTED);
      expect(transcriber.started).toBe(0);
    });

    it('идущая расшифровка переживает перезапуск', async () => {
      // Это и есть причина держать состояние в базе: провайдер работает
      // независимо от нашего процесса.
      await seedRunning(1);

      await runner().runAll();

      expect(transcriber.polled).toBe(1);
    });

    it('прерванное извлечение повторяется, а не признаётся неудачей', async () => {
      // Передача наружу не повторяется (вторая плата и второе
      // раскрытие), а извлечение повторяется: оно бесплатно и ничего не
      // раскрывает.
      const job = await seedForExtraction({ state: TranscriptionState.Extracting });

      await runner().runAll();

      expect(extractor.extracted).toBe(1);
      expect((await rowOf(job.id)).state).toBe(TranscriptionState.Queued);
    });

    it('повтор извлечения убирает недописанный выход до запуска', async () => {
      // `ffmpeg` писал в тот же путь, и остаток прошлой попытки иначе был
      // бы принят за готовую дорожку.
      const job = await seedForExtraction({ state: TranscriptionState.Extracting });

      store.saved.add(`${job.id}.opus`);

      await runner().runAll();

      expect(extractor.seenRemoved).toContain(`${job.id}.opus`);
    });

    it('остановка убивает ffmpeg и не ждёт его', async () => {
      // Тик, занятый `ffmpeg`, длится минуты, и держать остановку
      // приложения столько нельзя. Строка остаётся в `extracting`, и
      // следующий подъём начнёт извлечение заново.
      const job = await seedForExtraction();
      const live = runner();
      let started = (): void => {};
      const running = new Promise<void>((resolve) => {
        started = resolve;
      });

      extractor.holdUntilAborted = true;
      extractor.onExtract = () => {
        started();
      };

      const tick = live.runAll();

      await running;
      await live.onModuleDestroy();

      expect(extractor.aborted).toBe(true);
      expect((await rowOf(job.id)).state).toBe(TranscriptionState.Extracting);
      await tick;
    });

    it('остановка ждёт конца идущей отправки', async () => {
      // Иначе остался бы `sending` там, где через полсекунды был бы
      // `running`, — и следующий подъём закрыл бы живую расшифровку.
      const job = await seed();
      const live = runner();

      transcriber.holdMs = 50;

      const tick = live.runAll();

      await live.onModuleDestroy();

      expect(live.isIdle).toBe(true);
      expect((await rowOf(job.id)).state).toBe(TranscriptionState.Done);
      await tick;
    });

    it('нулевой интервал цикл не запускает', async () => {
      // Так работают тесты и локальная разработка.
      process.env[TRANSCRIPTION_POLL_ENV] = '0';

      const live = runner();

      live.onModuleInit();

      expect(live.hasTimer).toBe(false);
      expect(live.ticks).toBe(0);
      await live.onModuleDestroy();
    });

    it('первый тик идёт сразу, а не через интервал', async () => {
      // Иначе загруженная запись стояла бы в очереди лишние двадцать
      // секунд после каждого деплоя — то же решение, что у прогона
      // проверок.
      process.env[TRANSCRIPTION_POLL_ENV] = '20';

      const live = runner();

      live.onModuleInit();

      expect(live.ticks).toBe(1);
      expect(live.hasTimer).toBe(true);
      await live.onModuleDestroy();
    });
  });
});
