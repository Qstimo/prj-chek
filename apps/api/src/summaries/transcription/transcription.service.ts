import {
  AuditSubjectKind,
  ChronicleSource,
  RECORDING_MISSING,
  RECORDING_NOT_AUDIO,
  RECORDING_TOO_LARGE,
  TRANSCRIBER_DISABLED,
  TRANSCRIPTION_CANCELLED,
  TRANSCRIPTION_NO_ACCESS,
  TranscriptionState,
  type TranscriberInfo,
  type TranscriptionJob,
  type TranscriptionRequest,
} from '@cairn/shared';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  type OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

import { InsufficientLevelError, SectionNotVisibleError } from '../../access/access.errors';
import type { RequestSubject } from '../../access/access.types';
import { AuditService } from '../../audit/audit.service';
import { AuditAction, type AuditActor } from '../../audit/audit.types';
import { ChronicleRepository } from '../../chronicle/chronicle.repository';
import { DATABASE } from '../../db/db.module';
import type { Database, Transaction } from '../../db/db.types';
import type { TranscriptionJobRow } from '../../db/schema';
import { SummariesRepository } from '../summaries.repository';
import { AUDIO_EXTRACTOR, type AudioExtractor } from './extractor';
import { mediaPathsOf } from './media-paths';
import { PrepareAction, prepareDecision } from './prepare-decision';
import { RecordingStore, RecordingStoreFailure } from './recording-store';
import { transcriberSettings } from './settings';
import { TRANSCRIBER_SOURCE, type TranscriberSource } from './transcriber';
import { TranscriptionRepository } from './transcription.repository';

/**
 * Расшифровка записи созвона: транзакции, журнал и рождение саммари.
 *
 * Права проверяет репозиторий (ТЗ 4.1), служба добавляет порядок шагов и
 * журналирование — как `SummariesService`. Своего у неё два места, и оба
 * ломают обычное «одна транзакция на действие»:
 *
 * 1. **приём байтов идёт вне транзакции** — держать её открытой, пока
 *    полгигабайта текут по медленному каналу, нельзя: это занятое
 *    соединение из пула на всё время загрузки;
 * 2. **`unlink` исходника идёт после фиксации** — удаление файла не
 *    откатывается, и обратный порядок при откате оставил бы саммари без
 *    исходника и без текста (дизайн, 2.3).
 *
 * Рождение саммари идёт через **существующие** `ChronicleRepository` и
 * `SummariesRepository`: своей вставки в `summaries` здесь нет, как в первой
 * итерации не было своей вставки в `roadmap_versions`.
 */
@Injectable()
export class TranscriptionService implements OnModuleInit {
  private readonly logger = new Logger(TranscriptionService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: TranscriptionRepository,
    private readonly summaries: SummariesRepository,
    private readonly chronicle: ChronicleRepository,
    private readonly audit: AuditService,
    private readonly store: RecordingStore,
    // Источник, а не адаптер: настройка узла правится на экране и
    // действует без перезапуска, поэтому порт берётся на каждую
    // операцию (`transcriber.source.ts`).
    @Inject(TRANSCRIBER_SOURCE) private readonly transcribers: TranscriberSource,
    @Inject(AUDIO_EXTRACTOR) private readonly extractor: AudioExtractor,
  ) {}

  /**
   * Убирает `incoming/` при подъёме приложения.
   *
   * Из `onModuleInit`, а не из конструктора: подъём не должен зависеть от
   * порядка создания провайдеров. Уборка по времени жизни процесса законна
   * ровно потому, что в каталоге нет ничего, на что ссылалась бы хоть одна
   * строка базы — путь попадает в таблицу только после `rename` на место
   * (дизайн, 2.5 пункт 5).
   */
  async onModuleInit(): Promise<void> {
    await this.store.sweepIncoming();
  }

  /**
   * Принимает запись созвона и заводит задачу расшифровки.
   *
   * Порядок обязателен и назван:
   *
   * 1. **порт выключен — отказ до всякого файла.** Иначе запись легла бы на
   *    том и осталась там навсегда: расшифровать её нечем, а человек о ней
   *    забудет;
   * 2. **`prepareDecision` по объявленному типу** — только «умеет ли эта
   *    установка такой контейнер вообще». Иначе два гигабайта дотекли бы на
   *    том, чтобы получить отказ, который был известен заранее;
   * 3. приём байтов потоком, **вне транзакции**;
   * 4. **`prepareDecision` второй раз**, когда размер известен: теперь он
   *    выбирает путь — отдать как есть или перекодировать. Два вызова одной
   *    функции на разных входах не дубль: первый отсекает заведомо
   *    негодное, второй выбирает путь;
   * 5. задача и запись журнала — одной транзакцией. Отказ на этом шаге
   *    убирает принятый файл: строки в базе нет, и подобрать за собой
   *    некому, кроме самого приёма.
   */
  async accept(
    subject: RequestSubject,
    projectId: string,
    request: TranscriptionRequest,
    body: Readable,
  ): Promise<TranscriptionJob> {
    const settings = transcriberSettings();
    // Порт берётся один раз на приём: решение «можно ли принимать» и
    // паспорт задачи обязаны описывать **одну** настройку, иначе задача
    // уехала бы с именем узла, которого в ней уже нет.
    const transcriber = await this.transcribers.current();

    if (!transcriber.isEnabled) {
      throw new ConflictException({
        code: TRANSCRIBER_DISABLED,
        message: 'Расшифровка записи не настроена: обратитесь к администратору.',
      });
    }

    // Размер на этом шаге неизвестен, поэтому ноль, и `isOpus` — да:
    // вопрос задаётся один, про контейнер. Соврать здесь в сторону «можно»
    // безопасно — настоящее решение принимает второй вызов ниже, когда
    // известны и размер, и содержимое.
    this.requirePrepared(request.uploadType, 0, true, transcriber.maxSendBytes);

    const jobId = randomUUID();
    const accepted = await this.accepting(() =>
      this.store.accept(jobId, request.uploadType, body, settings.maxUploadBytes),
    );

    try {
      const decision = this.requirePrepared(
        request.uploadType,
        accepted.bytes,
        accepted.isOpus,
        transcriber.maxSendBytes,
      );

      return await this.db.transaction(async (tx) => {
        const job = await this.repository.create(subject, tx, projectId, {
          id: jobId,
          occurredOn: request.occurredOn,
          title: request.title,
          uploadPath: accepted.path,
          uploadBytes: accepted.bytes,
          uploadType: request.uploadType,
          transcriber: transcriber.kind,
          model: transcriber.model,
          // `Pass` означает «загруженный файл и есть дорожка»: та же
          // строка пути, а не копия файла.
          audio:
            decision === PrepareAction.Pass
              ? { path: accepted.path, bytes: accepted.bytes, type: request.uploadType }
              : null,
        });

        await this.audit.record(tx, actorOf(subject), {
          action: AuditAction.SummaryRecordingUploaded,
          entityType: 'transcription_job',
          entityId: job.id,
          projectId,
          metadata: {
            uploadBytes: accepted.bytes,
            uploadType: request.uploadType,
            transcriber: transcriber.kind,
            occurredOn: request.occurredOn,
            title: request.title,
          },
        });

        return job;
      });
    } catch (cause) {
      // Принятый файл убирается, и это не «после фиксации»: фиксировать
      // нечего — строки не появилось.
      await this.store.removeAll([accepted.path]);

      throw cause;
    }
  }

  /**
   * Настройки службы, видимые любому вошедшему.
   *
   * Явная проекция, а не свойства адаптера: ключ и каталог не должны иметь
   * физической возможности утечь в ответ. Список принимаемых контейнеров
   * считает **сервер** — вычитать его в браузере значило бы завести второе
   * место, где живёт правило, и первым же расхождением показать человеку
   * формат, который сервер отвергнет (дизайн, 5.1).
   *
   * У выключенной службы узла и модели нет: называть узел, куда ничего не
   * уходит, значило бы врать подписью. И список пуст — загрузка не
   * принимает ничего, а не «принимает, но некуда».
   */
  async transcriberInfo(): Promise<TranscriberInfo> {
    const settings = transcriberSettings();
    const transcriber = await this.transcribers.current();
    const isEnabled = transcriber.isEnabled;

    return {
      isEnabled,
      kind: transcriber.kind,
      host: isEnabled ? transcriber.host : null,
      model: isEnabled ? transcriber.model || null : null,
      maxUploadBytes: settings.maxUploadBytes,
      maxSendBytes: transcriber.maxSendBytes,
      canExtract: this.extractor.isAvailable,
      acceptedTypes: isEnabled ? this.extractor.acceptedTypes : [],
      audioBitrate: this.extractor.bitrate,
    };
  }

  /**
   * Контейнеры, которые **умеет** эта установка.
   *
   * Отличается от `acceptedTypes` настроек, и различие намеренное: тот
   * список отвечает на «что можно загрузить сейчас» (у выключенной службы —
   * ничего), а этот — на «какие контейнеры установка понимает», и он нужен
   * телу отказа `415`, чтобы экран назвал форматы словами.
   */
  uploadTypesOf(): string[] {
    return this.extractor.acceptedTypes;
  }

  /**
   * Абсолютный путь дорожки саммари и её тип содержимого.
   *
   * Отдаётся **дорожка**, а не загруженный файл: отдавать полгигабайта
   * видео, чтобы услышать спорную фразу, незачем, и ручки для исходника
   * нет вовсе (дизайн, 3.3).
   *
   * Отсутствие файла — законный случай (поднялись из копии базы, том
   * пересоздали), и он разбирается **при чтении**: проверять существование
   * файла в проекции списка значило бы ходить на диск на каждую строку
   * каждого списка ради сведения, важного ровно в один момент — когда
   * человек нажал «слушать» (дизайн, 3.5).
   */
  async recordingOf(
    subject: RequestSubject,
    projectId: string,
    summaryId: string,
  ): Promise<{ path: string; mediaType: string }> {
    const job = await this.repository.lastForSummary(subject, projectId, summaryId);

    if (!job?.audioPath) {
      throw this.missing();
    }

    try {
      await this.store.size(job.audioPath);
    } catch {
      throw this.missing();
    }

    return {
      path: this.store.absolutePathOf(job.audioPath),
      mediaType: job.audioType ?? 'audio/ogg',
    };
  }

  /** Очередь проекта: незакрытые и неудавшиеся задачи. */
  async queue(subject: RequestSubject, projectId: string): Promise<TranscriptionJob[]> {
    return this.repository.findQueue(subject, projectId);
  }

  /** Очередь по всем проектам, куда субъект может писать хронику. */
  async overview(subject: RequestSubject): Promise<TranscriptionJob[]> {
    return this.repository.findOverview(subject);
  }

  /**
   * Заводит повторную расшифровку существующего саммари.
   *
   * Работает после уборки исходника: новая задача берёт дорожку, а
   * `prepareDecision` на ней ответит `Pass` — она уже в `OGG/Opus` и уже в
   * пределе отправки. То есть повтор не просто возможен, а **дешевле
   * первого прохода**: он минует `ffmpeg` целиком (дизайн, 3.3).
   */
  async retry(
    subject: RequestSubject,
    projectId: string,
    summaryId: string,
  ): Promise<TranscriptionJob> {
    const transcriber = await this.transcribers.current();

    if (!transcriber.isEnabled) {
      throw new ConflictException({
        code: TRANSCRIBER_DISABLED,
        message: 'Расшифровка записи не настроена: обратитесь к администратору.',
      });
    }

    try {
      return await this.db.transaction((tx) =>
        this.repository.createForSummary(subject, tx, projectId, summaryId, {
          transcriber: transcriber.kind,
          model: transcriber.model,
        }),
      );
    } catch (cause) {
      throw this.outwardOf(cause, transcriberSettings().maxUploadBytes);
    }
  }

  /**
   * Укладывает готовый текст: рождает саммари либо правит его запись.
   *
   * Порядок внутри обязателен и назван: текст, `done` и
   * `summary.transcribed` идут **одной** транзакцией, а путь исходника,
   * который вернул `markDone`, уносится уже **после** её фиксации. Обратный
   * порядок при падении между шагами дал бы законченную расшифровку без
   * текста — работу, за которую заплатили и которую потеряли.
   *
   * Право проверяется здесь, а не на момент загрузки, потому что через этот
   * шаг и идёт запись в проект. Выдачу могли отозвать, пока запись
   * расшифровывалась, — случай законный, и он закрывает задачу кодом
   * {@link TRANSCRIPTION_NO_ACCESS}, а не бросает наружу: прогону некому
   * сообщать об отказе (дизайн, 6.5).
   */
  async settle(job: TranscriptionJobRow, text: string): Promise<void> {
    const subject = await this.repository.requesterOf(job.requestedBySubjectId);

    if (!subject) {
      // Ссылка на `subjects` с `restrict`: субъекта не стало бы только
      // вместе с задачей. Охрана инварианта, а не ожидаемый случай.
      this.logger.warn(`Расшифровка ${job.id}: субъекта, попросившего её, больше нет`);
      await this.loseAccess(job, null);

      return;
    }

    let sourcePath: string | null;

    try {
      sourcePath = await this.db.transaction(async (tx) => {
        const summaryId = await this.layText(subject, tx, job, text);
        const done = await this.repository.markDone(tx, job.id, summaryId);

        await this.audit.record(tx, actorOf(subject), {
          action: AuditAction.SummaryTranscribed,
          entityType: 'transcription_job',
          entityId: job.id,
          projectId: job.projectId,
          metadata: {
            summaryId,
            chars: text.length,
            transcriber: job.transcriber,
            model: job.model,
            // Отвечает на вопрос «куда девался мой файл на полгигабайта»:
            // другого ответа, кроме журнала, у человека нет.
            sourceRemoved: done.sourcePath !== null,
            uploadBytes: job.uploadBytes,
            uploadType: job.uploadType,
          },
        });

        return done.sourcePath;
      });
    } catch (cause) {
      if (isLostAccess(cause)) {
        await this.loseAccess(job, subject);

        return;
      }

      throw cause;
    }

    if (sourcePath === null) {
      return;
    }

    try {
      await this.store.remove(sourcePath);
    } catch (cause) {
      // Текст уже в базе; откатывать его из-за осиротевшего файла значило
      // бы потерять работу, за которую заплатили. Сирота занимает ровно
      // столько места, сколько занимал, и данных не раскрывает.
      this.logger.warn(`Исходник ${sourcePath} остался на томе: ${String(cause)}`);
    }
  }

  /**
   * Закрывает задачу неудачей и пишет её в журнал.
   *
   * `upload_path` не трогает **ни при одном** коде, и это главный довод
   * решения владельца 2: повторить попытку всегда есть из чего. Отказ
   * извлечения, отказ службы, таймаут, отмена — ни один из них не уносит
   * загруженный файл (дизайн, 7.5). Единственное исключение —
   * {@link loseAccess}, и там повторять некому.
   */
  async fail(job: TranscriptionJobRow, code: string, durationMs = 0): Promise<void> {
    const actor = await this.actorFor(job);

    await this.db.transaction(async (tx) => {
      await this.repository.markFailed(tx, job.id, code);

      if (actor) {
        await this.audit.record(tx, actor, {
          action: AuditAction.SummaryTranscriptionFailed,
          entityType: 'transcription_job',
          entityId: job.id,
          projectId: job.projectId,
          metadata: {
            transcriber: job.transcriber,
            host: job.host,
            // Код, а не тело чужого ответа: в нём бывает и присланное
            // нами, и подробности о ключе.
            code,
            durationMs,
          },
        });
      }
    });
  }

  /**
   * Отменяет задачу по просьбе человека.
   *
   * Отменить **передачу** нельзя: байты уже ушли, и делать вид, что нет,
   * служба не будет. Провайдеру уходит `forget` — best effort, его отказ
   * исхода не меняет (дизайн, 2.3).
   *
   * Названная граница этой итерации: идущий `ffmpeg` отмена **не убивает**.
   * Строка закрывается сразу, а извлечение, дошедшее до конца, увидит
   * закрытую задачу и свою дорожку уберёт — в очередь она не вернётся
   * (`markExtracted` переводит только из `extracting`).
   */
  async cancel(subject: RequestSubject, projectId: string, jobId: string): Promise<TranscriptionJob> {
    const row = await this.db.transaction((tx) =>
      this.repository.requireRow(subject, tx, projectId, jobId),
    );

    if (row.state === TranscriptionState.Done || row.state === TranscriptionState.Failed) {
      // Без своего кода намеренно: терминальные состояния терминальны, и
      // отличать «уже готово» от «уже не вышло» интерфейсу нечем — он и так
      // показывает закрытую строку без кнопки отмены.
      throw new ConflictException('Эта расшифровка уже закончилась: отменять нечего.');
    }

    await this.fail(row, TRANSCRIPTION_CANCELLED);

    if (row.externalId) {
      try {
        await (await this.transcribers.current()).forget(row.externalId);
      } catch (cause) {
        this.logger.warn(`Служба не забыла результаты ${row.externalId}: ${String(cause)}`);
      }
    }

    return this.repository.findById(subject, projectId, jobId);
  }

  /**
   * Удаляет задачу, не ставшую саммари, вместе с её файлами.
   *
   * Единственный способ убрать неудавшуюся расшифровку, и он нужен: иначе
   * загруженное видео на полгигабайта осталось бы лежать навсегда, а
   * неудавшихся расшифровок за месяц набирается на десятки гигабайт
   * (дизайн, 2.5 пункт 3).
   */
  async remove(subject: RequestSubject, projectId: string, jobId: string): Promise<void> {
    const { mediaPaths } = await this.db.transaction(async (tx) => {
      const row = await this.repository.requireRow(subject, tx, projectId, jobId);
      const removed = await this.repository.remove(subject, tx, projectId, jobId);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.SummaryTranscriptionDeleted,
        entityType: 'transcription_job',
        entityId: jobId,
        projectId,
        metadata: { bytes: row.uploadBytes, state: row.state, code: row.failureCode },
      });

      return removed;
    });

    await this.store.removeAll(mediaPaths);
  }

  /**
   * Кладёт текст в хронику и отдаёт идентификатор саммари.
   *
   * Два разных пути, и различает их наличие саммари, а не состояние
   * задачи: у первой расшифровки саммари рождается вместе с записью и
   * получает свою пару записей журнала, у повторной — правится содержание
   * существующей записи. Второй копии паспорта при этом не возникает:
   * заголовок и дата принадлежат записи хроники.
   */
  private async layText(
    subject: RequestSubject,
    tx: Transaction,
    job: TranscriptionJobRow,
    text: string,
  ): Promise<string> {
    if (job.summaryId === null) {
      const created = await this.summaries.create(subject, tx, job.projectId, {
        // Паспорт введён человеком при загрузке; инвариант «есть паспорт
        // тогда и только тогда, когда нет саммари» держит репозиторий.
        occurredOn: job.occurredOn!,
        title: job.title!,
        text,
      });

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.ChronicleEntryCreated,
        entityType: 'chronicle_entry',
        entityId: created.chronicleEntryId,
        projectId: job.projectId,
        metadata: {
          title: created.title,
          occurredOn: created.occurredOn,
          source: ChronicleSource.Summary,
        },
      });

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.SummaryCreated,
        entityType: 'summary',
        entityId: created.id,
        projectId: job.projectId,
        metadata: { title: created.title, occurredOn: created.occurredOn, chars: text.length },
      });

      return created.id;
    }

    const summary = await this.summaries.requireForWrite(
      subject,
      tx,
      job.projectId,
      job.summaryId,
    );

    await this.chronicle.update(subject, tx, job.projectId, summary.chronicleEntryId, {
      content: text,
    });

    // Запись, изменившаяся в ленте «Хроники» без следа в журнале, была бы
    // дыркой — тот же довод, которым первая итерация объясняла
    // `chronicle_entry.created` при создании саммари. Сам текст в журнал не
    // попадает: только его длина.
    await this.audit.record(tx, actorOf(subject), {
      action: AuditAction.ChronicleEntryUpdated,
      entityType: 'chronicle_entry',
      entityId: summary.chronicleEntryId,
      projectId: job.projectId,
      metadata: { chars: text.length, source: ChronicleSource.Summary },
    });

    // Правка записи двигает `updated_at`, а `isTextStale` первой итерации
    // считается по нему: пометка «задачи возможно устарели» достаётся
    // бесплатно, без своей колонки (дизайн, 2.2).
    return summary.id;
  }

  /**
   * Закрывает задачу потерей доступа и убирает **оба** файла.
   *
   * Единственное исключение из правила «неудача сохраняет исходник», и его
   * надо читать вместе с причиной: правило существует затем, чтобы человеку
   * было из чего повторить попытку, а здесь повторять **некому** — у
   * субъекта больше нет права писать в этот проект, а значит нет и доступа
   * к задаче. Иначе на томе лежало бы до двух гигабайт, видимых никому.
   *
   * Строка остаётся: она маленькая и отвечает на вопрос «что случилось с
   * загруженной записью» (дизайн, 6.5).
   */
  private async loseAccess(
    job: TranscriptionJobRow,
    subject: RequestSubject | null,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.repository.markFailed(tx, job.id, TRANSCRIPTION_NO_ACCESS);
      await this.repository.forgetMedia(tx, job.id);

      if (subject) {
        await this.audit.record(tx, actorOf(subject), {
          action: AuditAction.SummaryTranscriptionFailed,
          entityType: 'transcription_job',
          entityId: job.id,
          projectId: job.projectId,
          metadata: {
            transcriber: job.transcriber,
            host: job.host,
            code: TRANSCRIPTION_NO_ACCESS,
            durationMs: 0,
          },
        });
      }
    });

    await this.store.removeAll(mediaPathsOf([job]));
  }

  /** Действующее лицо журнала по задаче; `null` — субъекта не стало. */
  private async actorFor(job: TranscriptionJobRow): Promise<AuditActor | null> {
    const subject = await this.repository.requesterOf(job.requestedBySubjectId);

    return subject ? actorOf(subject) : null;
  }

  /**
   * Решение о приведении записи либо названный отказ.
   *
   * Отказ — `409`, а не `415`: формат сам по себе законен (он в
   * `UPLOAD_TYPES`), негодна **установка** — на ней нет `ffmpeg`. `415`
   * сказал бы «такого формата не бывает», и человек пошёл бы искать другой
   * файл вместо того, чтобы попросить администратора (дизайн, 5.3).
   */
  private requirePrepared(
    uploadType: string,
    uploadBytes: number,
    isOpus: boolean,
    maxSendBytes: number,
  ): PrepareAction {
    const decision = prepareDecision({
      uploadType,
      uploadBytes,
      isOpus,
      maxSendBytes,
      canExtract: this.extractor.isAvailable,
    });

    if (decision.action === PrepareAction.Reject) {
      throw new ConflictException({
        code: decision.code,
        message:
          'Эта установка принимает только MP3, WAV и OGG: извлечение дорожки не настроено.',
      });
    }

    return decision.action;
  }

  /** Записи нет: `404` с названным кодом, а не пустой ответ. */
  private missing(): NotFoundException {
    return new NotFoundException({
      code: RECORDING_MISSING,
      message: 'Запись этого саммари недоступна.',
    });
  }

  /** Приём байтов с переводом отказов хранилища в коды ответа. */
  private async accepting<T>(accept: () => Promise<T>): Promise<T> {
    try {
      return await accept();
    } catch (cause) {
      throw this.outwardOf(cause, transcriberSettings().maxUploadBytes);
    }
  }

  /**
   * Отказ хранилища в ответ наружу; прочее — как есть.
   *
   * Настоящее число предела едет в теле: экран обязан назвать его словами,
   * а не своей копией настройки, которую администратор мог поменять минуту
   * назад.
   */
  private outwardOf(cause: unknown, maxUploadBytes: number): unknown {
    if (!(cause instanceof RecordingStoreFailure)) {
      return cause;
    }

    if (cause.code === RECORDING_TOO_LARGE) {
      return new PayloadTooLargeException({
        code: cause.code,
        maxBytes: maxUploadBytes,
        message: cause.message,
      });
    }

    if (cause.code === RECORDING_NOT_AUDIO) {
      return new BadRequestException({ code: cause.code, message: cause.message });
    }

    // `recording_missing` уходит наружу `409`, а не `404`: саммари
    // существует и видно, нечего расшифровывать — его дорожки. `404` здесь
    // сказал бы «такого саммари нет», и человек пошёл бы искать его в
    // другом проекте (дизайн, 5.1).
    return new ConflictException({ code: cause.code, message: cause.message });
  }
}

/**
 * Потеряна ли выдача: отзыв субъекта или снятая выдача.
 *
 * Оба исключения приходят из `requireLevel`, то есть ровно оттуда, где
 * право и проверяется. `SectionNotVisibleError` накрывает и случай
 * «саммари исчезло», но различать их здесь нечем и незачем: исход один —
 * текст уложить некуда.
 */
function isLostAccess(cause: unknown): boolean {
  return cause instanceof InsufficientLevelError || cause instanceof SectionNotVisibleError;
}

/**
 * Строит действующее лицо журнала из субъекта запроса.
 *
 * Экспортируется ради прогона: записи о передаче и о неудаче пишет он, но
 * **действующее лицо у них то же** — человек, попросивший расшифровку, — и
 * второй способ его собрать разошёлся бы с этим при первой правке.
 * Системного лица здесь нет намеренно (дизайн, 6.4).
 */
export function actorOf(subject: RequestSubject): AuditActor {
  return {
    kind: subject.kind as unknown as Exclude<AuditSubjectKind, AuditSubjectKind.System>,
    id: subject.id,
    label: subject.label,
  };
}
