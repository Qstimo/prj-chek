import {
  AccessLevel,
  RECORDING_MISSING,
  Section,
  TRANSCRIPTION_ALREADY_RUNNING,
  TranscriberKind,
  TranscriptionState,
  type TranscriptionJob,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm';

import { SectionNotVisibleError } from '../../access/access.errors';
import { AccessService } from '../../access/access.service';
import type { RequestSubject } from '../../access/access.types';
import { DATABASE } from '../../db/db.module';
import type { Database, Executor, Transaction } from '../../db/db.types';
import {
  projects,
  summaries,
  transcriptionJobs,
  type TranscriptionJobRow,
} from '../../db/schema';
import { mediaPathsOf } from './media-paths';
import { RecordingStoreFailure } from './recording-store';

/** Состояния, из которых задача ещё может куда-то перейти. */
const UNCLOSED_STATES = [
  TranscriptionState.Queued,
  TranscriptionState.Extracting,
  TranscriptionState.Sending,
  TranscriptionState.Running,
];

/** Что видно в очереди на экране: незакрытое и неудавшееся, без `done`. */
const QUEUE_STATES = [...UNCLOSED_STATES, TranscriptionState.Failed];

/** Чем расшифровка настроена на момент создания задачи. */
export interface TranscriptionService {
  transcriber: TranscriberKind;
  model: string;
}

/** Первая расшифровка: паспорт будущего саммари и принятый файл. */
export interface TranscriptionCreate extends TranscriptionService {
  /**
   * Идентификатор задачи задаётся извне, а не базой.
   *
   * Потому что файл на томе назван им **до** вставки строки: тело запроса
   * течёт в `incoming/`, а потом переезжает в `<id задачи>.<расширение>`
   * (дизайн, 5.2). Дать базе выбрать ключ значило бы либо переименовывать
   * файл после вставки, либо вставлять строку до того, как файл дотёк.
   */
  id: string;
  occurredOn: string;
  title: string;
  uploadPath: string;
  uploadBytes: number;
  uploadType: string;
}

/** Что уйдёт на уборку с диска после фиксации транзакции. */
export interface RemovedMedia {
  /**
   * Уникальные непустые пути файлов задачи.
   *
   * Схлопнуты в множество: когда извлечения не было, обе колонки держат
   * одну и ту же строку, а у дошедшей до `done` задачи `upload_path` пуст
   * — и остаётся один путь, дорожка.
   */
  mediaPaths: string[];
}

/**
 * Задачи расшифровки с проверкой права.
 *
 * Субъект идёт первым аргументом у всех ручек, **кроме** `pending` и
 * переходов состояний: их зовёт фоновый прогон, у которого субъекта на
 * этом шаге нет. Это не забытая проверка: прогон собирает `RequestSubject`
 * по `requested_by_subject_id` задачи и зовёт им **репозитории записи** —
 * хронику и саммари, — а переходы состояния своей задачи правом не
 * охраняются, потому что строку он уже получил из `pending`, где её
 * видимость и решилась (дизайн, 6.4).
 *
 * Право на загрузку — то же, что на создание саммари: `Chronicle ≥ write`
 * (дизайн, 1.1). Новой единицы выдачи доступа не появилось.
 */
@Injectable()
export class TranscriptionRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly access: AccessService,
  ) {}

  /** Заводит задачу первой расшифровки: саммари ещё нет. */
  async create(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    input: TranscriptionCreate,
  ): Promise<TranscriptionJob> {
    await this.requireWrite(subject, projectId, tx);

    const [created] = await tx
      .insert(transcriptionJobs)
      .values({
        id: input.id,
        projectId,
        requestedBySubjectId: subject.id,
        transcriber: input.transcriber,
        model: input.model,
        occurredOn: input.occurredOn,
        title: input.title,
        uploadPath: input.uploadPath,
        uploadBytes: input.uploadBytes,
        uploadType: input.uploadType,
      })
      .returning();

    return this.projectionOf(tx, created!);
  }

  /**
   * Заводит повторную расшифровку по существующему саммари.
   *
   * Файлы **не копируются**: новая строка несёт те же пути, что последняя
   * задача этого саммари. Подсчёта ссылок нет — удаление идёт по саммари
   * целиком (дизайн, 3.3).
   *
   * Два разных вида пустоты различаются, и спутать их значит сломать
   * повтор навсегда: пустой `upload_path` — **обычное** состояние саммари
   * после укладки текста, а пустой `audio_path` — отказ, потому что
   * расшифровывать нечего.
   *
   * Паспорт не принимается и не копируется: у саммари он уже есть, и это
   * паспорт его записи хроники. Второй копии не бывает.
   */
  async createForSummary(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    summaryId: string,
    service: TranscriptionService,
  ): Promise<TranscriptionJob> {
    await this.requireWrite(subject, projectId, tx);

    const [summary] = await tx
      .select({ id: summaries.id })
      .from(summaries)
      .where(and(eq(summaries.id, summaryId), eq(summaries.projectId, projectId)))
      .limit(1);

    if (!summary) {
      throw new SectionNotVisibleError();
    }

    const [source] = await tx
      .select()
      .from(transcriptionJobs)
      .where(eq(transcriptionJobs.summaryId, summaryId))
      .orderBy(desc(transcriptionJobs.startedAt))
      .limit(1);

    if (!source?.audioPath) {
      // Накрывает и «текст вставили руками» (задач нет вовсе), и «дорожку
      // убрали»: в обоих случаях расшифровывать нечего.
      throw new RecordingStoreFailure(RECORDING_MISSING, 'Дорожки этого саммари на томе нет');
    }

    if (UNCLOSED_STATES.includes(source.state)) {
      // Уникум в базе сказал бы то же самое, но отказом целостности:
      // названный код нужен интерфейсу, а не только журналу.
      throw new RecordingStoreFailure(
        TRANSCRIPTION_ALREADY_RUNNING,
        'По этому саммари расшифровка уже идёт',
      );
    }

    const [created] = await tx
      .insert(transcriptionJobs)
      .values({
        projectId,
        summaryId,
        requestedBySubjectId: subject.id,
        transcriber: service.transcriber,
        model: service.model,
        uploadPath: source.uploadPath,
        uploadBytes: source.uploadBytes,
        uploadType: source.uploadType,
        audioPath: source.audioPath,
        audioBytes: source.audioBytes,
        audioType: source.audioType,
      })
      .returning();

    return this.projectionOf(tx, created!);
  }

  /**
   * Задача проекта из адреса.
   *
   * Чужая задача выглядит несуществующей — выборка по `(id, project_id)`,
   * как `requireEntry` в хронике: `403` сообщил бы, что объект существует.
   */
  async findById(
    subject: RequestSubject,
    projectId: string,
    jobId: string,
    executor: Executor = this.db,
  ): Promise<TranscriptionJob> {
    const row = await this.requireJob(subject, executor, projectId, jobId);

    return this.projectionOf(executor, row);
  }

  /**
   * Очередь проекта: незакрытые и неудавшиеся, без `done`.
   *
   * Успешная расшифровка видна саммари в истории; две строки об одном были
   * бы двумя правдами.
   */
  async findQueue(
    subject: RequestSubject,
    projectId: string,
    executor: Executor = this.db,
  ): Promise<TranscriptionJob[]> {
    await this.requireWrite(subject, projectId, executor);

    const rows = await executor
      .select()
      .from(transcriptionJobs)
      .where(
        and(
          eq(transcriptionJobs.projectId, projectId),
          inArray(transcriptionJobs.state, QUEUE_STATES),
        ),
      )
      .orderBy(desc(transcriptionJobs.startedAt));

    return this.projectionsOf(executor, rows);
  }

  /**
   * Очередь по всем проектам, где у субъекта есть право записи на хронику.
   *
   * Фильтрует существующая `projectIdsWithLevel` — та самая, которую
   * завела первая итерация. Новой функции доступа не появляется.
   */
  async findOverview(subject: RequestSubject): Promise<TranscriptionJob[]> {
    const ids = await this.access.projectIdsWithLevel(
      subject,
      Section.Chronicle,
      AccessLevel.Write,
    );

    if (ids.length === 0) return [];

    const rows = await this.db
      .select()
      .from(transcriptionJobs)
      .where(
        and(
          inArray(transcriptionJobs.projectId, ids),
          inArray(transcriptionJobs.state, QUEUE_STATES),
        ),
      )
      .orderBy(desc(transcriptionJobs.startedAt));

    return this.projectionsOf(this.db, rows);
  }

  /**
   * Незакрытые задачи для прогона, старые первыми.
   *
   * Субъекта не принимает: прогон не действует «от системы», но и прав на
   * этом шаге не проверяет — он собирает `RequestSubject` по
   * `requested_by_subject_id` каждой строки и работает им дальше
   * (дизайн, 6.4).
   */
  async pending(executor: Executor = this.db): Promise<TranscriptionJobRow[]> {
    return executor
      .select()
      .from(transcriptionJobs)
      .where(inArray(transcriptionJobs.state, UNCLOSED_STATES))
      .orderBy(asc(transcriptionJobs.startedAt));
  }

  /**
   * Захватывает работу по извлечению дорожки.
   *
   * Не журналирование — наружу ничего не уходит, — а захват: без него два
   * тика двух экземпляров API запустили бы два `ffmpeg` на один файл и
   * писали бы в один и тот же выходной путь. `sent_at` не трогается:
   * запись машину не покидала.
   */
  async markExtracting(tx: Transaction, jobId: string): Promise<void> {
    await tx
      .update(transcriptionJobs)
      .set({ state: TranscriptionState.Extracting })
      .where(eq(transcriptionJobs.id, jobId));
  }

  /**
   * Записывает готовую дорожку и возвращает задачу в очередь.
   *
   * Одной транзакцией: `audio_*` без возврата в `queued` читались бы как
   * «дорожка есть, а работа висит».
   */
  async markExtracted(
    tx: Transaction,
    jobId: string,
    audio: { path: string; bytes: number; type: string },
  ): Promise<void> {
    await tx
      .update(transcriptionJobs)
      .set({
        state: TranscriptionState.Queued,
        audioPath: audio.path,
        audioBytes: audio.bytes,
        audioType: audio.type,
      })
      .where(eq(transcriptionJobs.id, jobId));
  }

  /**
   * Отмечает начало передачи записи наружу.
   *
   * Отвергает задачу с пустым `audio_path` — это **охрана** инварианта
   * «наружу уходит только то, что лежит в `audio_path`». Решение принимает
   * `prepareDecision`, и это второе место, где правило держится: решение
   * можно переписать, охрану забыть нельзя (дизайн, 2.6).
   */
  async markSending(tx: Transaction, jobId: string, target: { host: string }): Promise<void> {
    const updated = await tx
      .update(transcriptionJobs)
      .set({ state: TranscriptionState.Sending, sentAt: new Date(), host: target.host })
      .where(and(eq(transcriptionJobs.id, jobId), isNotNull(transcriptionJobs.audioPath)))
      .returning({ id: transcriptionJobs.id });

    if (updated.length === 0) {
      throw new RecordingStoreFailure(
        RECORDING_MISSING,
        'Отправлять нечего: дорожка не извлечена',
      );
    }
  }

  /**
   * Отмечает, что провайдер взял работу.
   *
   * Требует непустого идентификатора операции: строка `running` без него —
   * строка, которую нечем опросить.
   */
  async markRunning(tx: Transaction, jobId: string, externalId: string): Promise<void> {
    const trimmed = externalId.trim();

    if (trimmed.length === 0) {
      throw new RecordingStoreFailure(
        RECORDING_MISSING,
        'Операция провайдера не названа: опрашивать нечего',
      );
    }

    await tx
      .update(transcriptionJobs)
      .set({ state: TranscriptionState.Running, externalId: trimmed })
      .where(eq(transcriptionJobs.id, jobId));
  }

  /**
   * Закрывает задачу неудачей.
   *
   * `upload_path` не трогает, и это главный довод решения владельца 2:
   * **исходник переживает любую неудачу**, потому что повторить попытку
   * всегда есть из чего (дизайн, 2.6 и 7.5).
   */
  async markFailed(tx: Transaction, jobId: string, code: string): Promise<void> {
    await tx
      .update(transcriptionJobs)
      .set({ state: TranscriptionState.Failed, failureCode: code, finishedAt: new Date() })
      .where(eq(transcriptionJobs.id, jobId));
  }

  /**
   * Закрывает задачу успехом и отдаёт путь исходника на уборку.
   *
   * **Единственный** метод, обнуляющий `upload_path`, и единственное место,
   * где живёт сравнение путей:
   *
   * ```
   * если upload_path пуст             → sourcePath = null (убирать нечего)
   * если upload_path === audio_path   → sourcePath = null (файл один, 2.1)
   * иначе                             → обнулить upload_path, вернуть его
   * ```
   *
   * Возвращает путь, а не удаляет файл: `unlink` обязан идти **после**
   * фиксации транзакции, и делает его служба. Обратный порядок — убрать
   * файл, а потом фиксировать — при откате оставил бы саммари без
   * исходника и без текста; а `unlink` внутри транзакции не
   * откатывается вовсе.
   *
   * Ни один другой переход состояния `upload_path` не трогает — иначе
   * правило «исходник переживает любую неудачу» держалось бы на
   * внимательности.
   */
  async markDone(tx: Transaction, jobId: string): Promise<{ sourcePath: string | null }> {
    const [row] = await tx
      .select()
      .from(transcriptionJobs)
      .where(eq(transcriptionJobs.id, jobId))
      .limit(1);

    if (!row) {
      throw new SectionNotVisibleError();
    }

    // Равенство путей означает «убирать нечего»: иначе уборка удалила бы
    // единственный файл саммари и оставила запись, которую нечем
    // переслушать.
    const sourcePath =
      row.uploadPath !== null && row.uploadPath !== row.audioPath ? row.uploadPath : null;

    await tx
      .update(transcriptionJobs)
      .set({
        state: TranscriptionState.Done,
        finishedAt: new Date(),
        ...(sourcePath === null ? {} : { uploadPath: null }),
      })
      .where(eq(transcriptionJobs.id, jobId));

    return { sourcePath };
  }

  /**
   * Удаляет задачу и отдаёт пути её файлов вызывающему.
   *
   * Файлы удаляются **после** фиксации транзакции, не внутри: удаление
   * файла не откатывается (дизайн, 2.5 пункт 4).
   */
  async remove(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    jobId: string,
  ): Promise<RemovedMedia> {
    const row = await this.requireJob(subject, tx, projectId, jobId);

    await tx.delete(transcriptionJobs).where(eq(transcriptionJobs.id, jobId));

    return { mediaPaths: mediaPathsOf([row]) };
  }

  /**
   * Обнуляет оба пути, оставляя размеры.
   *
   * Нужно, когда файлы убрали, а строку сохранили: после потери доступа
   * (дизайн, 6.5) или уборки руками. Размер загруженного остаётся — это
   * единственный ответ на «что я загружал».
   */
  async forgetMedia(tx: Transaction, jobId: string): Promise<void> {
    await tx
      .update(transcriptionJobs)
      .set({ uploadPath: null, audioPath: null })
      .where(eq(transcriptionJobs.id, jobId));
  }

  /** Задача проекта из адреса под правом записи на «Хронику». */
  private async requireJob(
    subject: RequestSubject,
    executor: Executor,
    projectId: string,
    jobId: string,
  ): Promise<TranscriptionJobRow> {
    await this.requireWrite(subject, projectId, executor);

    const [row] = await executor
      .select()
      .from(transcriptionJobs)
      .where(and(eq(transcriptionJobs.id, jobId), eq(transcriptionJobs.projectId, projectId)))
      .limit(1);

    if (!row) {
      throw new SectionNotVisibleError();
    }

    return row;
  }

  /** Право, которым открывается загрузка записи: то же, что у саммари. */
  private async requireWrite(
    subject: RequestSubject,
    projectId: string,
    executor: Executor,
  ): Promise<void> {
    await this.access.requireLevel(
      subject,
      projectId,
      Section.Chronicle,
      AccessLevel.Write,
      executor,
    );
  }

  /** Проекция одной задачи: имя проекта одним запросом. */
  private async projectionOf(
    executor: Executor,
    row: TranscriptionJobRow,
  ): Promise<TranscriptionJob> {
    const [projection] = await this.projectionsOf(executor, [row]);

    return projection!;
  }

  /**
   * Проекции задач: имена проектов одним запросом на список.
   *
   * Существование файла на диске **не** проверяется: это обращение к
   * диску на каждую строку каждого списка ради сведения, которое важно
   * ровно в один момент — когда человек нажал «слушать» (дизайн, 3.5).
   * `hasRecording` читается из колонки пути.
   */
  private async projectionsOf(
    executor: Executor,
    rows: TranscriptionJobRow[],
  ): Promise<TranscriptionJob[]> {
    if (rows.length === 0) return [];

    const names = new Map<string, string>();
    const found = await executor
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(inArray(projects.id, [...new Set(rows.map((row) => row.projectId))]));

    for (const project of found) {
      names.set(project.id, project.name);
    }

    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      projectName: names.get(row.projectId) ?? '',
      summaryId: row.summaryId,
      occurredOn: row.occurredOn,
      title: row.title,
      state: row.state,
      transcriber: row.transcriber,
      model: row.model,
      host: row.host,
      uploadBytes: row.uploadBytes,
      uploadType: row.uploadType,
      audioBytes: row.audioBytes,
      audioType: row.audioType,
      hasRecording: row.audioPath !== null,
      failureCode: row.failureCode,
      startedAt: row.startedAt.toISOString(),
      sentAt: row.sentAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
    }));
  }
}
