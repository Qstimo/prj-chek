import {
  RECORDING_HEAD_BYTES,
  RECORDING_MISSING,
  RECORDING_NOT_AUDIO,
  RECORDING_TOO_LARGE,
  familyAcceptsType,
  uploadFamilyOf,
} from '@cairn/shared';
import { Injectable, Logger } from '@nestjs/common';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, unlink } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

/** Переменная окружения с каталогом записей. */
export const RECORDINGS_DIR_ENV = 'CAIRN_RECORDINGS_DIR';

/** Куда монтируется том, если переменная не задана. */
export const DEFAULT_RECORDINGS_DIR = '/var/lib/cairn/recordings';

/** Подкаталог под текущие загрузки: его уборка идёт при подъёме. */
const INCOMING = 'incoming';

/** Расширение извлечённой дорожки: `OGG/Opus`, моно, 16 кГц. */
const AUDIO_EXTENSION = 'opus';

/**
 * Расширение по типу содержимого.
 *
 * Нужно ровно одному: чтобы файл, вытащенный с тома руками, открылся
 * плеером (дизайн, 3.2). Присланное человеком имя файла здесь не
 * участвует — его мы не получаем вовсе.
 */
const EXTENSION_BY_TYPE: Readonly<Record<string, string>> = {
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/flac': 'flac',
  'audio/webm': 'webm',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
  'video/webm': 'webm',
};

/**
 * Отказ хранилища записей: код из контракта, без подробностей файла.
 *
 * Код нужен вызывающему, чтобы ответить разным кодом HTTP: негодная
 * подпись — `400`, перебор предела — `413`, отсутствующий файл — `404`.
 * Образец — `SuggesterFailure`.
 */
export class RecordingStoreFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RecordingStoreFailure';
  }
}

/** Принятая запись: путь относительно каталога и настоящий размер. */
export interface AcceptedRecording {
  /** Относительный путь — ровно то, что ляжет в `upload_path`. */
  path: string;
  /** Посчитано по ходу приёма, а не взято из `Content-Length`. */
  bytes: number;
}

/**
 * Записи созвонов на томе: приём потоком, чтение, удаление, уборка.
 *
 * **Файлы, а не база** (дизайн, 3.1): ежедневная копия `pg_dump` не должна
 * вырасти с мегабайтов до гигабайтов, да и `ffmpeg` работает с файлом, а не
 * с колонкой.
 *
 * **Поток, а не буфер** (дизайн, 5.2): два гигабайта в куче процесса,
 * который делит машину с PostgreSQL, вебом и прокси, — это не граница, а
 * падение. Память при приёме постоянна и равна размеру буфера потока.
 *
 * Каталог читается **при каждом вызове**, как настройки порта: иначе смена
 * `CAIRN_RECORDINGS_DIR` требовала бы перезапуска API, а предел — тем более
 * (в первой редакции дизайна он читался один раз при подъёме, и про это
 * пришлось бы извиняться).
 */
@Injectable()
export class RecordingStore {
  private readonly logger = new Logger(RecordingStore.name);

  /** Корень каталога записей; читается при каждом обращении. */
  private rootDir(): string {
    const configured = process.env[RECORDINGS_DIR_ENV]?.trim();

    return configured && configured.length > 0 ? configured : DEFAULT_RECORDINGS_DIR;
  }

  /**
   * Абсолютный путь внутри каталога записей.
   *
   * Проверка выхода за каталог идёт через `resolve` и сравнение с корнем, а
   * не поиском `..` в строке: искать подстроку значило бы ловить написание
   * вместо результата. Путь строится из идентификатора задачи, но проверка
   * стоит всё равно — хранилище отдаёт файлы наружу ручкой, и становиться
   * способом прочитать что угодно оно не должно.
   */
  absolutePathOf(relativePath: string): string {
    const root = resolve(this.rootDir());
    const target = resolve(root, relativePath);
    const inside = relative(root, target);

    if (isAbsolute(relativePath) || inside.startsWith('..') || inside.includes(`..${sep}`)) {
      throw new RecordingStoreFailure(RECORDING_MISSING, 'Путь ведёт за каталог записей');
    }

    return target;
  }

  /** Имя загруженного файла: идентификатор задачи и расширение по типу. */
  uploadNameOf(jobId: string, uploadType: string): string {
    const extension = EXTENSION_BY_TYPE[uploadType];

    if (!extension) {
      // Тип уже проверен схемой контракта: сюда можно попасть только
      // новым значением `UPLOAD_TYPES` без строки в карте выше.
      throw new RecordingStoreFailure(RECORDING_NOT_AUDIO, 'Неизвестный контейнер записи');
    }

    return `${jobId}.${extension}`;
  }

  /**
   * Имя извлечённой дорожки.
   *
   * Рядом с загруженным и под тем же именем: два файла на задачу собьются
   * расширениями, но не именами, и осиротевший файл всегда называет свою
   * задачу.
   */
  audioNameOf(jobId: string): string {
    return `${jobId}.${AUDIO_EXTENSION}`;
  }

  /**
   * Принимает поток записи на том и отдаёт путь с настоящим размером.
   *
   * Пять шагов раздела 5.2 дизайна: поток в `incoming/<uuid>.part` →
   * подсчёт байтов по ходу → подпись первого куска → `rename` на место.
   * Переименование внутри одного тома атомарно и не копирует байты;
   * отсюда правило «в таблицу путь попадает только после `rename`», на
   * котором стоит уборка `incoming/` при подъёме.
   *
   * Любой отказ убирает недописанный файл **в `finally`** — это
   * единственное место в системе, где уборка идёт так, а не после фиксации
   * транзакции: строки в базе ещё нет, фиксировать нечего.
   */
  async accept(
    jobId: string,
    uploadType: string,
    stream: Readable,
    maxBytes: number,
  ): Promise<AcceptedRecording> {
    const name = this.uploadNameOf(jobId, uploadType);
    const root = resolve(this.rootDir());
    const incomingDir = join(root, INCOMING);

    // Том монтируется пустым: падать на первой загрузке незачем.
    await mkdir(incomingDir, { recursive: true });

    const partPath = join(incomingDir, `${randomUUID()}.part`);
    let moved = false;

    try {
      const bytes = await this.drain(stream, partPath, uploadType, maxBytes);

      await rename(partPath, join(root, name));
      moved = true;

      return { path: name, bytes };
    } finally {
      if (!moved) {
        // ENOENT здесь законен: файл мог и не успеть появиться.
        await rm(partPath, { force: true }).catch(() => undefined);
      }
    }
  }

  /**
   * Пишет поток в файл, считая байты и проверяя подпись первого куска.
   *
   * Подпись читается по первым {@link RECORDING_HEAD_BYTES} байтам, и
   * несовпадение разрушает поток: два гигабайта чужого формата на том не
   * попадают. Предел проверяется **по ходу**, а не по `Content-Length` —
   * заголовку верить нельзя, он может и соврать, и отсутствовать.
   */
  private async drain(
    stream: Readable,
    partPath: string,
    uploadType: string,
    maxBytes: number,
  ): Promise<number> {
    const file = createWriteStream(partPath);
    const head: Buffer[] = [];
    let headBytes = 0;
    let checked = false;
    let bytes = 0;

    try {
      for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);

        bytes += buffer.length;

        if (bytes > maxBytes) {
          stream.destroy();

          throw new RecordingStoreFailure(
            RECORDING_TOO_LARGE,
            `Запись больше предела загрузки (${maxBytes} байт)`,
          );
        }

        if (!checked) {
          head.push(buffer);
          headBytes += buffer.length;

          // Решение принимается, как только головы хватает, либо на конце
          // потока: короткий файл тоже обязан получить ответ.
          if (headBytes >= RECORDING_HEAD_BYTES) {
            this.requireSignature(Buffer.concat(head), uploadType, stream);
            checked = true;
          }
        }

        await this.write(file, buffer);
      }

      if (!checked) {
        this.requireSignature(Buffer.concat(head), uploadType, stream);
      }

      return bytes;
    } finally {
      await new Promise<void>((done) => file.close(() => done()));
    }
  }

  /** Записывает кусок, дожидаясь освобождения буфера. */
  private write(file: ReturnType<typeof createWriteStream>, chunk: Buffer): Promise<void> {
    return new Promise((done, fail) => {
      file.write(chunk, (error) => (error ? fail(error) : done()));
    });
  }

  /**
   * Подпись обязана принадлежать семейству объявленного типа.
   *
   * `Content-Type` доказательством не считается: его ставит браузер по
   * расширению, и подделать его ничего не стоит (дизайн, 4.1).
   */
  private requireSignature(head: Buffer, uploadType: string, stream: Readable): void {
    const family = uploadFamilyOf(head);

    if (family === null || !familyAcceptsType(family, uploadType)) {
      stream.destroy();

      throw new RecordingStoreFailure(
        RECORDING_NOT_AUDIO,
        'Содержимое не похоже на объявленный контейнер',
      );
    }
  }

  /** Читает запись целиком. Отсутствие файла — названный отказ. */
  async read(relativePath: string): Promise<Buffer> {
    try {
      return await readFile(this.absolutePathOf(relativePath));
    } catch (error) {
      throw this.missingOr(error, relativePath);
    }
  }

  /** Размер файла: им мерится извлечённая дорожка перед отправкой. */
  async size(relativePath: string): Promise<number> {
    try {
      return (await stat(this.absolutePathOf(relativePath))).size;
    } catch (error) {
      throw this.missingOr(error, relativePath);
    }
  }

  /**
   * Удаляет файл. Отсутствие файла ошибкой **не** считается.
   *
   * `ENOENT` значит «уже убран», и это не повод валить уборку саммари:
   * удаление файла не откатывается, и обратный порядок сделал бы саммари
   * неудаляемым из-за файла (дизайн, 2.5 пункт 4).
   */
  async remove(relativePath: string): Promise<void> {
    try {
      await unlink(this.absolutePathOf(relativePath));
    } catch (error) {
      if (!isMissing(error)) {
        throw error;
      }
    }
  }

  /**
   * Убирает все названные файлы, не валя операцию человека.
   *
   * Зовётся **после фиксации** транзакции, которая унесла строки (дизайн,
   * 2.5 пункт 4): удаление файла не откатывается, и обратный порядок унёс
   * бы запись созвона у саммари, удаление которого потом откатилось, —
   * восстановить файл было бы нечем.
   *
   * Цена выбранного порядка — осиротевший файл при сбое `unlink`: он
   * остаётся предупреждением в логе, места занимает ровно столько, сколько
   * занимал, и данных не раскрывает. Откатывать удаление саммари из-за
   * файла значило бы сделать саммари неудаляемым. Сторожа осиротевших
   * файлов в этой итерации нет — названная граница, а не недоработка.
   *
   * По одному вызову на путь и по очереди: сбой на первом не должен унести
   * второй, а предупреждение обязано называть свой файл.
   */
  async removeAll(paths: string[]): Promise<void> {
    for (const path of paths) {
      try {
        await this.remove(path);
      } catch (error) {
        this.logger.warn(`Запись ${path} осталась на томе: ${String(error)}`);
      }
    }
  }

  /**
   * Убирает `incoming/` целиком.
   *
   * Зовётся из `onModuleInit` службы, а не из конструктора: подъём
   * приложения не должен зависеть от порядка создания провайдеров.
   *
   * Уборка по времени жизни процесса законна ровно потому, что в каталоге
   * нет ничего, на что ссылалась бы хоть одна строка базы: путь попадает в
   * таблицу только после `rename` на место. Живых запросов у нового
   * процесса не бывает (дизайн, 2.5 пункт 5).
   */
  async sweepIncoming(): Promise<void> {
    const incomingDir = join(resolve(this.rootDir()), INCOMING);

    try {
      await rm(incomingDir, { recursive: true, force: true });
    } catch (error) {
      // Не повод не подняться: недописанные куски занимают место, но
      // ничего не ломают и данных не раскрывают.
      this.logger.warn(`Не удалось убрать ${INCOMING}/: ${String(error)}`);
    }
  }

  /** Отсутствие файла — названный отказ, прочее — как есть. */
  private missingOr(error: unknown, relativePath: string): unknown {
    if (isMissing(error)) {
      return new RecordingStoreFailure(RECORDING_MISSING, `Записи ${relativePath} на томе нет`);
    }

    return error;
  }
}

/** `ENOENT`: файла нет. Законный случай, а не авария (дизайн, 3.5). */
function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
