import {
  AccessLevel,
  RECORDING_NEEDS_FFMPEG,
  RECORDING_NOT_AUDIO,
  RECORDING_TOO_LARGE,
  Section,
  SubjectKind,
  TRANSCRIBER_DISABLED,
  TRANSCRIBER_UNAVAILABLE,
  TRANSCRIPTION_CANCELLED,
  TRANSCRIPTION_NO_ACCESS,
  TranscriberKind,
  TranscriptionState,
  type TranscriptionRequest,
} from '@cairn/shared';
import { and, eq } from 'drizzle-orm';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccessService } from '../../access/access.service';
import type { RequestSubject } from '../../access/access.types';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/audit.types';
import { ChronicleRepository } from '../../chronicle/chronicle.repository';
import {
  auditLog,
  chronicleEntries,
  grants,
  projects,
  subjects,
  summaries,
  transcriptionJobs,
  users,
  type TranscriptionJobRow,
} from '../../db/schema';
import { RoadmapRepository } from '../../roadmap/roadmap.repository';
import { startTestDatabase, type TestDatabase } from '../../../test/db-fixture';
import { SummariesRepository } from '../summaries.repository';
import { DisabledTranscriber } from './disabled.transcriber';
import type { AudioExtractor, ExtractedAudio, MediaProbe } from './extractor';
import { RecordingStore, RecordingStoreFailure, type AcceptedRecording } from './recording-store';
import type { Transcriber, TranscriptionAnswer, TranscriptionInput } from './transcriber';
import { TranscriptionRepository } from './transcription.repository';
import { TranscriptionService } from './transcription.service';
import { UnavailableExtractor } from './unavailable.extractor';

/** Паспорт загружаемой записи: видео, которое придётся перекодировать. */
const PASSPORT: TranscriptionRequest = {
  occurredOn: '2026-11-17',
  title: 'Созвон по релизу',
  uploadType: 'video/mp4',
};

/** Размер загруженного: полгигабайта, как у настоящей записи созвона. */
const UPLOAD_BYTES = 566_231_040;

/** Имя файла на машине человека: в систему оно не попадает вовсе. */
const FILE_NAME = 'Клиент Б, разбор инцидента.mp4';

/**
 * Хранилище, которое помнит вызовы и не касается диска.
 *
 * Настоящих медиафайлов нет ни одного: поток — одна строка, а размер и
 * признак Opus назначает тест. Приём потоком проверен своим тестом
 * (`recording-store.test.ts`), и повторять его здесь значило бы проверять
 * файловую систему вместо порядка шагов службы.
 */
class StubStore extends RecordingStore {
  /** Что лежит «на томе»: удаление отсюда вычёркивает. */
  readonly saved: string[] = [];
  readonly removed: string[] = [];
  failOnRemove = false;
  /** Чем кончится приём: отказ назначает тест. */
  failAcceptWith: RecordingStoreFailure | null = null;
  bytes = UPLOAD_BYTES;
  isOpus = false;
  /**
   * Была ли транзакция зафиксирована к моменту уборки.
   *
   * Проверяется **чужим соединением**: роль приложения не видит
   * незафиксированной вставки, поэтому «текст уже виден appDb» означает
   * ровно «транзакция зафиксирована». Сравнение порядка вызовов было бы
   * договорённостью, а это — наблюдение.
   */
  sawCommitted: boolean | null = null;

  constructor(private readonly committed: () => Promise<boolean>) {
    super();
  }

  override async accept(
    jobId: string,
    uploadType: string,
    _stream: Readable,
    maxBytes: number,
  ): Promise<AcceptedRecording> {
    if (this.failAcceptWith) {
      throw this.failAcceptWith;
    }

    if (this.bytes > maxBytes) {
      throw new RecordingStoreFailure(
        RECORDING_TOO_LARGE,
        `Запись больше предела загрузки (${maxBytes} байт)`,
      );
    }

    const path = this.uploadNameOf(jobId, uploadType);

    this.saved.push(path);

    return { path, bytes: this.bytes, isOpus: this.isOpus };
  }

  override async remove(relativePath: string): Promise<void> {
    this.removed.push(relativePath);
    this.sawCommitted = await this.committed();
    this.saved.splice(this.saved.indexOf(relativePath), 1);

    if (this.failOnRemove) {
      throw new Error('том не смонтирован');
    }
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
  readonly forgotten: string[] = [];

  async start(_input: TranscriptionInput, _signal: AbortSignal): Promise<TranscriptionAnswer> {
    throw new Error('служба в этом тесте не вызывается');
  }

  async poll(_externalId: string, _signal: AbortSignal): Promise<TranscriptionAnswer> {
    throw new Error('служба в этом тесте не вызывается');
  }

  async forget(externalId: string): Promise<void> {
    this.forgotten.push(externalId);
  }
}

/** Заглушка порта извлечения: ни один тест не запускает `ffmpeg`. */
class StubExtractor implements AudioExtractor {
  readonly isAvailable = true;
  readonly bitrate = '24k';
  readonly acceptedTypes = ['audio/mpeg', 'video/mp4'];

  async probe(_uploadPath: string, _signal: AbortSignal): Promise<MediaProbe> {
    return { hasAudio: true, audioCodec: 'aac', durationSeconds: 3600 };
  }

  async extract(_uploadPath: string, _jobId: string, _signal: AbortSignal): Promise<ExtractedAudio> {
    throw new Error('извлечение в этом тесте не вызывается');
  }
}

describe('служба расшифровки', () => {
  let testDb: TestDatabase;
  let store: StubStore;
  let repository: TranscriptionRepository;
  let summariesRepository: SummariesRepository;
  let transcriber: StubTranscriber;
  let service: TranscriptionService;
  /** Вторая служба: порт выключен, установка остаётся рабочей. */
  let disabledService: TranscriptionService;
  /** Третья: ключ есть, `ffmpeg` нет — установка рабочая, только уже. */
  let withoutFfmpeg: TranscriptionService;
  let projectId: string;
  let adminUserId: string;
  let subjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const access = new AccessService(testDb.db);
    const chronicle = new ChronicleRepository(testDb.db, access);

    summariesRepository = new SummariesRepository(
      testDb.db,
      access,
      chronicle,
      new RoadmapRepository(testDb.db, access),
    );
    repository = new TranscriptionRepository(testDb.db, access);
    store = new StubStore(
      async () => (await testDb.appDb.select({ id: chronicleEntries.id }).from(chronicleEntries)).length > 0,
    );
    transcriber = new StubTranscriber();

    const build = (port: Transcriber, extractor: AudioExtractor): TranscriptionService =>
      new TranscriptionService(
        testDb.db,
        repository,
        summariesRepository,
        chronicle,
        new AuditService(),
        store,
        port,
        extractor,
      );

    service = build(transcriber, new StubExtractor());
    disabledService = build(new DisabledTranscriber(), new StubExtractor());
    withoutFfmpeg = build(transcriber, new UnavailableExtractor());
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();
    vi.restoreAllMocks();
    store.saved.length = 0;
    store.removed.length = 0;
    transcriber.forgotten.length = 0;
    store.failOnRemove = false;
    store.failAcceptWith = null;
    store.sawCommitted = null;
    store.bytes = UPLOAD_BYTES;
    store.isOpus = false;

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

    await grant(AccessLevel.Write);
  });

  const writer = (): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'user@cairn.local',
    isSuperadmin: false,
    isRevoked: false,
  });

  async function grant(level: AccessLevel): Promise<void> {
    await testDb.db
      .insert(grants)
      .values({ subjectId, projectId, section: Section.Chronicle, level, grantedBy: adminUserId })
      .onConflictDoUpdate({
        target: [grants.subjectId, grants.projectId, grants.section],
        set: { level },
      });
  }

  async function revoke(): Promise<void> {
    await testDb.db
      .delete(grants)
      .where(and(eq(grants.subjectId, subjectId), eq(grants.projectId, projectId)));
  }

  /** Поток тела: байты здесь ничего не решают, подпись проверяет хранилище. */
  function stream(): Readable {
    return Readable.from([Buffer.from(FILE_NAME)]);
  }

  /**
   * Дописывает задаче извлечённую дорожку — то, что сделал бы прогон.
   *
   * Нужно всюду, где речь о повторе: «Расшифровать снова» берёт дорожку
   * существующего саммари, и без неё повтор законно отказывает.
   */
  async function withTrack(jobId: string): Promise<TranscriptionJobRow> {
    await testDb.db
      .update(transcriptionJobs)
      .set({ audioPath: `${jobId}.opus`, audioBytes: 11_534_336, audioType: 'audio/ogg' })
      .where(eq(transcriptionJobs.id, jobId));
    store.saved.push(`${jobId}.opus`);

    return rowOf(jobId);
  }

  /** Строка задачи целиком: прогон работает именно с ней, а не с проекцией. */
  async function rowOf(jobId: string): Promise<TranscriptionJobRow> {
    const [row] = await testDb.db
      .select()
      .from(transcriptionJobs)
      .where(eq(transcriptionJobs.id, jobId));

    return row!;
  }

  /** Записи журнала по действию: порядок внутри транзакции неопределён. */
  async function entriesOf(action: AuditAction): Promise<(typeof auditLog.$inferSelect)[]> {
    return testDb.db.select().from(auditLog).where(eq(auditLog.action, action));
  }

  /** Задача первой расшифровки, принятая службой. */
  async function accepted(
    passport: TranscriptionRequest = PASSPORT,
    on: TranscriptionService = service,
  ): Promise<TranscriptionJobRow> {
    const job = await on.accept(writer(), projectId, passport, stream());

    return rowOf(job.id);
  }

  describe('приём записи', () => {
    it('кладёт файл на том и заводит задачу одной транзакцией', async () => {
      const job = await service.accept(writer(), projectId, PASSPORT, stream());

      expect(job.state).toBe(TranscriptionState.Queued);
      expect(job.summaryId).toBeNull();
      expect(store.saved).toEqual([`${job.id}.mp4`]);
      expect((await rowOf(job.id)).uploadBytes).toBe(UPLOAD_BYTES);
    });

    it('пишет в журнал приём записи, без имени файла', async () => {
      const job = await service.accept(writer(), projectId, PASSPORT, stream());
      const [entry] = await entriesOf(AuditAction.SummaryRecordingUploaded);

      expect(entry).toMatchObject({
        entityType: 'transcription_job',
        entityId: job.id,
        projectId,
        metadata: {
          uploadBytes: UPLOAD_BYTES,
          uploadType: 'video/mp4',
          transcriber: TranscriberKind.External,
          occurredOn: '2026-11-17',
          title: 'Созвон по релизу',
        },
      });
      // Имена файлов на машинах людей нередко говорят больше, чем
      // содержимое: мы их не получаем вовсе и никуда не пишем.
      expect(JSON.stringify(await testDb.rowsOf(auditLog))).not.toContain('Клиент');
    });

    it('при выключенном порте запись не принимается и на том не ложится', async () => {
      // Иначе файл лёг бы на том и остался там навсегда: расшифровать его
      // нечем, а человек о нём забудет.
      await expect(
        disabledService.accept(writer(), projectId, PASSPORT, stream()),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: TRANSCRIBER_DISABLED }),
      });
      expect(store.saved).toEqual([]);
    });

    it('без ffmpeg видео не принимается названным кодом, до приёма байтов', async () => {
      // Решение принимает `prepareDecision`, и приём отвергается **до**
      // записи двух гигабайт на том.
      await expect(
        withoutFfmpeg.accept(writer(), projectId, PASSPORT, stream()),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: RECORDING_NEEDS_FFMPEG }),
      });
      expect(store.saved).toEqual([]);
    });

    it('без ffmpeg уже-пригодное аудио принимается', async () => {
      // Установка без `ffmpeg` остаётся рабочей, только уже: MP3, WAV и OGG.
      store.bytes = 10_000_000;

      const job = await withoutFfmpeg.accept(
        writer(),
        projectId,
        { ...PASSPORT, uploadType: 'audio/mpeg' },
        stream(),
      );

      expect(job.audioType).toBe('audio/mpeg');
    });

    it('запись больше предела загрузки не принимается и на том не ложится', async () => {
      process.env.CAIRN_RECORDING_MAX_BYTES = '1024';

      try {
        await expect(
          service.accept(writer(), projectId, PASSPORT, stream()),
        ).rejects.toMatchObject({
          response: expect.objectContaining({ code: RECORDING_TOO_LARGE, maxBytes: 1024 }),
        });
      } finally {
        delete process.env.CAIRN_RECORDING_MAX_BYTES;
      }

      expect(store.saved).toEqual([]);
    });

    it('негодная подпись отвергается названным кодом', async () => {
      store.failAcceptWith = new RecordingStoreFailure(
        RECORDING_NOT_AUDIO,
        'Содержимое не похоже на объявленный контейнер',
      );

      await expect(service.accept(writer(), projectId, PASSPORT, stream())).rejects.toMatchObject({
        response: expect.objectContaining({ code: RECORDING_NOT_AUDIO }),
      });
    });

    it('отказ после укладки файла файл убирает', async () => {
      // Иначе неудачный приём оставлял бы сироту при каждой ошибке: строки
      // в базе нет, и подобрать за собой некому, кроме самого приёма.
      vi.spyOn(repository, 'create').mockRejectedValue(new Error('база отказала'));

      await expect(service.accept(writer(), projectId, PASSPORT, stream())).rejects.toThrow();
      expect(store.saved).toEqual([]);
      expect(store.removed).toHaveLength(1);
    });

    it('без выдачи на хронику задача не заводится, а файл убирается', async () => {
      await revoke();

      await expect(service.accept(writer(), projectId, PASSPORT, stream())).rejects.toThrow();
      expect(store.saved).toEqual([]);
    });

    it('пригодное аудио не идёт на извлечение: дорожка равна загруженному', async () => {
      store.bytes = 10_000_000;

      const job = await accepted({ ...PASSPORT, uploadType: 'audio/mpeg' });

      expect(job.audioPath).toBe(job.uploadPath);
      expect(job.audioBytes).toBe(job.uploadBytes);
      expect(job.audioType).toBe('audio/mpeg');
    });

    it('крупное аудио идёт на извлечение, хотя контейнер службе годится', async () => {
      // Часовой `mp3` в 320 кбит/с стерео — это 144 МБ, мимо предела
      // отправки. Второй вызов `prepareDecision` считает уже настоящий
      // размер, и без него такая запись уехала бы службе целиком.
      store.bytes = 144_000_000;

      const job = await accepted({ ...PASSPORT, uploadType: 'audio/mpeg' });

      expect(job.audioPath).toBeNull();
      expect(job.state).toBe(TranscriptionState.Queued);
    });

    it('OGG решается содержимым: Vorbis перекодируется, Opus — нет', async () => {
      store.bytes = 5_000_000;
      store.isOpus = false;

      expect((await accepted({ ...PASSPORT, uploadType: 'audio/ogg' })).audioPath).toBeNull();

      store.isOpus = true;

      expect((await accepted({ ...PASSPORT, uploadType: 'audio/ogg' })).audioPath).not.toBeNull();
    });
  });

  describe('рождение саммари из расшифровки', () => {
    it('создаёт запись хроники и саммари одной транзакцией', async () => {
      const job = await accepted();

      await service.settle(job, 'Обсудили сроки.');

      const [entry] = await testDb.rowsOf(chronicleEntries);

      expect(entry?.content).toBe('Обсудили сроки.');
      expect(entry?.source).toBe('summary');
      expect(await testDb.rowsOf(summaries)).toHaveLength(1);
      expect((await rowOf(job.id)).state).toBe(TranscriptionState.Done);
    });

    it('паспорт берётся из задачи, а не придумывается', async () => {
      await service.settle(await accepted(), 'Текст.');

      const [entry] = await testDb.rowsOf(chronicleEntries);

      expect(entry?.title).toBe('Созвон по релизу');
      expect(entry?.occurredOn).toBe('2026-11-17');
    });

    it('done ставится той же транзакцией, что текст', async () => {
      // Обратный порядок при падении между шагами дал бы законченную
      // расшифровку без текста — работу, за которую заплатили и которую
      // потеряли.
      const job = await accepted();

      vi.spyOn(repository, 'markDone').mockRejectedValue(new Error('база отказала'));

      await expect(service.settle(job, 'Текст.')).rejects.toThrow();
      expect(await testDb.rowsOf(chronicleEntries)).toHaveLength(0);
      expect(await testDb.rowsOf(summaries)).toHaveLength(0);
    });

    it('работает правом того, кто попросил', async () => {
      // Системного действующего лица здесь нет: второй путь записи «от
      // системы, без проверки» был бы дыркой в модели прав.
      await service.settle(await accepted(), 'Текст.');

      const [entry] = await entriesOf(AuditAction.SummaryTranscribed);

      expect(entry?.subjectId).toBe(subjectId);
      expect(entry?.subjectLabel).toBe('user@cairn.local');
    });

    it('выдачу отозвали, пока расшифровывалось — текст не ляжет', async () => {
      const job = await accepted();

      await revoke();
      await service.settle(job, 'Текст.');

      const row = await rowOf(job.id);

      expect(row.state).toBe(TranscriptionState.Failed);
      expect(row.failureCode).toBe(TRANSCRIPTION_NO_ACCESS);
      expect(await testDb.rowsOf(chronicleEntries)).toHaveLength(0);
    });

    it('при потере доступа оба файла убираются, а строка остаётся', async () => {
      // Иначе на томе лежало бы до двух гигабайт, видимых никому: задачу
      // не видит ни тот, кто её создал, ни кто-либо другой. Это
      // единственное исключение из правила «неудача сохраняет исходник»,
      // и оно не противоречие: повторять **некому** (дизайн, 6.5).
      const job = await withTrack((await accepted()).id);

      await revoke();
      await service.settle(job, 'Текст.');

      const row = await rowOf(job.id);

      expect(row.uploadPath).toBeNull();
      expect(row.audioPath).toBeNull();
      expect(row.uploadBytes).toBe(UPLOAD_BYTES);
      expect(store.saved).toEqual([]);
    });

    it('повторная расшифровка правит существующую запись, а не плодит вторую', async () => {
      const first = await withTrack((await accepted()).id);

      await service.settle(first, 'Первый текст.');
      const repeat = await rowOf(
        (await service.retry(writer(), projectId, (await rowOf(first.id)).summaryId!)).id,
      );

      await service.settle(repeat, 'Новый текст.');

      expect(await testDb.rowsOf(summaries)).toHaveLength(1);
      expect((await testDb.rowsOf(chronicleEntries))[0]?.content).toBe('Новый текст.');
    });

    it('повторная расшифровка метит задачи возможно устаревшими', async () => {
      // Бесплатно: правка записи двигает `updated_at`, а `isTextStale`
      // первой итерации считается по нему.
      const first = await withTrack((await accepted()).id);

      await service.settle(first, 'Первый текст.');

      const summaryId = (await rowOf(first.id)).summaryId!;

      await testDb.db
        .update(summaries)
        .set({ suggestedTextAt: new Date(Date.now() - 60_000) })
        .where(eq(summaries.id, summaryId));

      const repeat = await rowOf((await service.retry(writer(), projectId, summaryId)).id);

      await service.settle(repeat, 'Новый текст.');

      const detail = await summariesRepository.findById(writer(), projectId, summaryId);

      expect(detail.isTextStale).toBe(true);
    });

    it('повторная расшифровка пишет в журнал число знаков', async () => {
      const first = await withTrack((await accepted()).id);

      await service.settle(first, 'Первый текст.');

      const summaryId = (await rowOf(first.id)).summaryId!;
      const repeat = await rowOf((await service.retry(writer(), projectId, summaryId)).id);

      await service.settle(repeat, 'Новый текст.');

      const entries = await entriesOf(AuditAction.SummaryTranscribed);

      expect(entries).toHaveLength(2);
      expect(entries.map((entry) => (entry.metadata as { chars: number }).chars)).toContain(12);
    });

    it('первый успех тоже пишет summary.transcribed', async () => {
      // Правка от решения об уборке исходника: прежде первый успех записи
      // не получал (её заменяла пара `chronicle_entry.created` +
      // `summary.created`), но теперь он уничтожает загруженный человеком
      // файл, а удаление данных обязано быть в неизменяемом журнале.
      const job = await accepted();

      await service.settle(job, 'Обсудили сроки.');

      const [entry] = await entriesOf(AuditAction.SummaryTranscribed);

      expect(entry?.metadata).toMatchObject({
        sourceRemoved: true,
        uploadBytes: UPLOAD_BYTES,
        uploadType: 'video/mp4',
        chars: 15,
      });
      expect(await entriesOf(AuditAction.ChronicleEntryCreated)).toHaveLength(1);
      expect(await entriesOf(AuditAction.SummaryCreated)).toHaveLength(1);
    });

    it('убирает исходник после фиксации транзакции, не внутри', async () => {
      // Обратный порядок при откате оставил бы саммари без исходника и без
      // текста; `unlink` внутри транзакции не откатывается вовсе.
      const job = await accepted();

      await service.settle(job, 'Текст.');

      expect(store.removed).toEqual([`${job.id}.mp4`]);
      expect(store.sawCommitted).toBe(true);
      expect((await rowOf(job.id)).uploadPath).toBeNull();
    });

    it('дорожку не трогает', async () => {
      // Запись, которая хранится, пока живёт саммари, — это дорожка.
      const job = await withTrack((await accepted()).id);

      await service.settle(job, 'Текст.');

      expect(store.removed).not.toContain(`${job.id}.opus`);
      expect((await rowOf(job.id)).audioPath).toBe(`${job.id}.opus`);
    });

    it('не убирает единственный файл у саммари из mp3', async () => {
      // Равенство путей означает «убирать нечего»: иначе уборка унесла бы
      // единственный файл саммари и оставила запись, которую нечем
      // переслушать.
      store.bytes = 10_000_000;

      const job = await accepted({ ...PASSPORT, uploadType: 'audio/mpeg' });

      await service.settle(job, 'Текст.');

      expect(store.removed).toEqual([]);
      expect(store.saved).toEqual([`${job.id}.mp3`]);
    });

    it('сбой уборки исходника не валит укладку текста', async () => {
      // Текст уже в базе; откатывать его из-за осиротевшего файла значило
      // бы потерять работу, за которую заплатили. Сирота виден
      // предупреждением в логе.
      const job = await accepted();

      store.failOnRemove = true;

      await expect(service.settle(job, 'Текст.')).resolves.toBeUndefined();
      expect((await testDb.rowsOf(chronicleEntries))[0]?.content).toBe('Текст.');
    });

    it('текста расшифровки в журнале нет', async () => {
      await service.settle(await accepted(), 'Секретное обсуждение увольнения.');

      expect(JSON.stringify(await testDb.rowsOf(auditLog))).not.toContain('увольнения');
    });
  });

  describe('неудача, отмена и удаление', () => {
    it('при неудаче исходник остаётся', async () => {
      // Главный довод решения владельца 2: повторить попытку всегда есть
      // из чего.
      const job = await accepted();

      await service.fail(job, TRANSCRIBER_UNAVAILABLE);

      const row = await rowOf(job.id);

      expect(row.state).toBe(TranscriptionState.Failed);
      expect(row.failureCode).toBe(TRANSCRIBER_UNAVAILABLE);
      expect(row.uploadPath).not.toBeNull();
      expect(store.removed).toEqual([]);
    });

    it('неудача пишется в журнал без тела чужого ответа', async () => {
      await service.fail(await accepted(), TRANSCRIBER_UNAVAILABLE, 1_200);

      const [entry] = await entriesOf(AuditAction.SummaryTranscriptionFailed);

      expect(entry?.metadata).toMatchObject({
        code: TRANSCRIBER_UNAVAILABLE,
        transcriber: TranscriberKind.External,
        durationMs: 1_200,
      });
    });

    it('повторная расшифровка после уборки исходника работает', async () => {
      // Дорожка есть, исходника нет — это обычное состояние саммари после
      // укладки текста, и «Расшифровать снова» обязано работать.
      const job = await withTrack((await accepted()).id);

      await service.settle(job, 'Текст.');

      const summaryId = (await rowOf(job.id)).summaryId!;

      await expect(service.retry(writer(), projectId, summaryId)).resolves.toBeDefined();
      expect((await rowOf(job.id)).uploadPath).toBeNull();
    });

    it('отмена закрывает задачу названным кодом и просит службу забыть', async () => {
      const job = await accepted();

      await testDb.db
        .update(transcriptionJobs)
        .set({ state: TranscriptionState.Running, externalId: 'операция-1' })
        .where(eq(transcriptionJobs.id, job.id));

      await service.cancel(writer(), projectId, job.id);

      const row = await rowOf(job.id);

      expect(row.state).toBe(TranscriptionState.Failed);
      expect(row.failureCode).toBe(TRANSCRIPTION_CANCELLED);
      expect(transcriber.forgotten).toEqual(['операция-1']);
      // Отменить передачу нельзя: байты ушли. А файл остаётся — отмена
      // такая же неудача, как остальные.
      expect(store.removed).toEqual([]);
    });

    it('отмена закрытой задачи — отказ, а не вторая отмена', async () => {
      const job = await accepted();

      await service.fail(job, TRANSCRIBER_UNAVAILABLE);

      await expect(service.cancel(writer(), projectId, job.id)).rejects.toThrow();
    });

    it('удаление задачи уносит файлы после фиксации и пишет в журнал', async () => {
      const job = await accepted();

      await service.fail(job, TRANSCRIBER_UNAVAILABLE);
      await service.remove(writer(), projectId, job.id);

      expect(await testDb.rowsOf(transcriptionJobs)).toHaveLength(0);
      expect(store.saved).toEqual([]);

      const [entry] = await entriesOf(AuditAction.SummaryTranscriptionDeleted);

      expect(entry?.metadata).toMatchObject({
        bytes: UPLOAD_BYTES,
        state: TranscriptionState.Failed,
        code: TRANSCRIBER_UNAVAILABLE,
      });
    });

    it('задача чужого проекта не удаляется и не раскрывается', async () => {
      const [other] = await testDb.db
        .insert(projects)
        .values({ slug: 'chuzhoj', name: 'Чужой' })
        .returning();
      const job = await accepted();

      await expect(service.remove(writer(), other!.id, job.id)).rejects.toThrow();
      expect(await testDb.rowsOf(transcriptionJobs)).toHaveLength(1);
    });
  });
});
