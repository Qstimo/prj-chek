import {
  AccessLevel,
  DEFAULT_MAX_SEND_BYTES,
  RECORDING_NEEDS_FFMPEG,
  SERVICE_AUDIO_TYPES,
  Section,
  SubjectKind,
  TranscriberKind,
  type TranscriptionRequest,
} from '@cairn/shared';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../../access/access.service';
import type { RequestSubject } from '../../access/access.types';
import { AuditService } from '../../audit/audit.service';
import { ChronicleRepository } from '../../chronicle/chronicle.repository';
import { grants, projects, subjects, users } from '../../db/schema';
import { RoadmapRepository } from '../../roadmap/roadmap.repository';
import { startTestDatabase, type TestDatabase } from '../../../test/db-fixture';
import { SummariesRepository } from '../summaries.repository';
import { RecordingStore, type AcceptedRecording } from './recording-store';
import { TRANSCRIPTION_ENV_NAMES } from './settings';
import type { Transcriber, TranscriptionAnswer, TranscriptionInput } from './transcriber';
import { TranscriptionRepository } from './transcription.repository';
import { TranscriptionService } from './transcription.service';
import { UnavailableExtractor } from './unavailable.extractor';

/**
 * Установка без `ffmpeg`: поток остаётся рабочим, только уже.
 *
 * Этот файл — тест **обещания**, которое `apps/api/Dockerfile` подкрепляет, а
 * не тест самого `Dockerfile` (его нечем проверить в Vitest). Обещание важнее
 * пакета: именно оно делает зависимость необязательной, и ровно оно сломается
 * незаметно, если кто-то решит, что без `ffmpeg` загрузка не нужна вовсе.
 *
 * `ffmpeg` здесь не запускается и не ищется: порт извлечения подменён
 * {@link UnavailableExtractor}, который ведёт себя одинаково и при отсутствии
 * пакета, и при `CAIRN_RECORDING_FFMPEG=off`. Тест, зависящий от
 * установленного `ffmpeg`, падал бы у половины разработчиков и в CI.
 */

/** Паспорт загружаемой записи: видео, которое без `ffmpeg` не принять. */
const PASSPORT: TranscriptionRequest = {
  occurredOn: '2026-11-17',
  title: 'Созвон по релизу',
  uploadType: 'video/mp4',
};

/** Уже-пригодное аудио: в пределе отправки, служба возьмёт как есть. */
const SMALL_MP3 = 10_000_000;

/**
 * Часовой `mp3` в 320 кбит/с стерео — 144 МБ.
 *
 * Контейнер службе годится, размер — нет, и урезать его без `ffmpeg` нечем.
 */
const BIG_MP3 = 144_000_000;

/** Хранилище без диска: настоящих медиафайлов в тестах нет ни одного. */
class StubStore extends RecordingStore {
  readonly saved: string[] = [];
  bytes = SMALL_MP3;

  override async accept(
    jobId: string,
    uploadType: string,
    _stream: Readable,
    _maxBytes: number,
  ): Promise<AcceptedRecording> {
    const path = this.uploadNameOf(jobId, uploadType);

    this.saved.push(path);

    return { path, bytes: this.bytes, isOpus: false };
  }

  override async remove(relativePath: string): Promise<void> {
    this.saved.splice(this.saved.indexOf(relativePath), 1);
  }
}

/** Порт расшифровки настроен: выключен ровно порт извлечения, не он. */
class StubTranscriber implements Transcriber {
  readonly kind = TranscriberKind.External;
  readonly model = 'general';
  readonly host = 'stt.api.cloud.yandex.net';
  readonly maxSendBytes = DEFAULT_MAX_SEND_BYTES;
  readonly serviceTypes = [...SERVICE_AUDIO_TYPES];
  readonly isEnabled = true;

  async start(_input: TranscriptionInput, _signal: AbortSignal): Promise<TranscriptionAnswer> {
    throw new Error('служба в этом тесте не вызывается');
  }

  async poll(_externalId: string, _signal: AbortSignal): Promise<TranscriptionAnswer> {
    throw new Error('служба в этом тесте не вызывается');
  }

  async forget(_externalId: string): Promise<void> {}
}

describe('установка без ffmpeg', () => {
  let testDb: TestDatabase;
  let store: StubStore;
  let summariesRepository: SummariesRepository;
  let service: TranscriptionService;
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
    store = new StubStore();
    service = new TranscriptionService(
      testDb.db,
      new TranscriptionRepository(testDb.db, access),
      summariesRepository,
      chronicle,
      new AuditService(),
      store,
      new StubTranscriber(),
      new UnavailableExtractor(),
    );
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();
    // Ключ или предел, оставленный соседним тестом, менял бы поведение
    // ручки приёма: настройки читаются при каждом вызове.
    for (const name of TRANSCRIPTION_ENV_NAMES) {
      delete process.env[name];
    }
    store.saved.length = 0;
    store.bytes = SMALL_MP3;

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

  const writer = (): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'user@cairn.local',
    isSuperadmin: false,
    isRevoked: false,
  });

  /** Тело запроса: байты здесь ничего не решают, подпись проверяет хранилище. */
  function stream(): Readable {
    return Readable.from([Buffer.from('байты записи')]);
  }

  it('принимает уже-пригодное аудио', async () => {
    // Без `ffmpeg` поток остаётся рабочим, только уже: это то же правило,
    // что «без ключа порт выключен» — отсутствующая возможность сужает
    // поток, а не ломает его.
    const job = await service.accept(
      writer(),
      projectId,
      { ...PASSPORT, uploadType: 'audio/mpeg' },
      stream(),
    );

    expect(job.audioType).toBe('audio/mpeg');
    expect(job.audioBytes).toBe(SMALL_MP3);
  });

  it('видео отвергает названным кодом, а не общей ошибкой', async () => {
    // `409`, а не `415`: формат сам по себе законен, негодна **установка**.
    // `415` сказал бы «такого формата не бывает», и человек пошёл бы искать
    // другой файл вместо того, чтобы попросить администратора.
    await expect(
      service.accept(writer(), projectId, PASSPORT, stream()),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: RECORDING_NEEDS_FFMPEG }),
    });
    // И отказ приходит **до** приёма байтов: иначе полгигабайта дотекли бы
    // на том ради отказа, который был известен заранее.
    expect(store.saved).toEqual([]);
  });

  it('сужает список принимаемых форматов, а не врёт о нём', async () => {
    const info = await service.transcriberInfo();

    expect(info.acceptedTypes).toEqual(['audio/mpeg', 'audio/ogg', 'audio/wav']);
    expect(info.canExtract).toBe(false);
    // Битрейт не называется вовсе: назвать его, не умея перекодировать,
    // значило бы соврать подписью.
    expect(info.audioBitrate).toBeNull();
  });

  it('крупное аудио тоже отвергает: урезать его нечем', async () => {
    // Контейнер службе годится, размер — нет, и механизма привести его в
    // предел на этой установке не существует. Отказ приходит вторым
    // вызовом `prepareDecision`, когда размер уже известен, — поэтому
    // принятый файл обязан быть убран.
    store.bytes = BIG_MP3;

    await expect(
      service.accept(writer(), projectId, { ...PASSPORT, uploadType: 'audio/mpeg' }, stream()),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: RECORDING_NEEDS_FFMPEG }),
    });
    expect(store.saved).toEqual([]);
  });

  it('остальной поток саммари не задет вовсе', async () => {
    // Текст вставляется руками, задачи набираются, релиз формируется — ни
    // один уровень настройки не ломает уже работающую возможность.
    const summary = await testDb.db.transaction((tx) =>
      summariesRepository.create(writer(), tx, projectId, {
        occurredOn: '2026-11-17',
        title: 'Созвон по релизу',
        text: 'Обсудили сроки.',
      }),
    );

    expect(summary.id).toBeDefined();
    expect(summary.text).toBe('Обсудили сроки.');
  });
});
