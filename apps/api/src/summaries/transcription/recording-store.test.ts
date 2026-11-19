import { RECORDING_MISSING, RECORDING_NOT_AUDIO, RECORDING_TOO_LARGE } from '@cairn/shared';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RECORDINGS_DIR_ENV, RecordingStore } from './recording-store';

const JOB_ID = '11111111-1111-1111-1111-111111111111';

/** Щедрый предел: в проверках, где предел не при чём, он не должен мешать. */
const MAX = 10_000_000;

/**
 * Подписи собираются из байтов здесь же: ни один тест не читает
 * настоящего медиафайла (запрет 2 плана).
 */
const MP4_HEAD = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
]);
const ID3 = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00]);
const WAV = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
]);
const PDF_HEAD = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
/** Хвост: столько же, сколько в голове, — больше не нужно. */
const TAIL = Buffer.alloc(64, 0x11);
/** Хвост, заведомо переполняющий малый предел. */
const BIG_TAIL = Buffer.alloc(4096, 0x22);

describe('хранилище записей', () => {
  let root: string;
  let store: RecordingStore;

  /** Что лежит в подкаталоге текущих загрузок. */
  async function lsIncoming(): Promise<string[]> {
    return readdir(join(root, 'incoming')).catch(() => []);
  }

  /** Что лежит в каталоге готовых записей, кроме самого `incoming/`. */
  async function lsRecordings(): Promise<string[]> {
    const names = await readdir(root).catch(() => []);

    return names.filter((name) => name !== 'incoming');
  }

  /** Поток, обрывающийся на середине: так выглядит потеря связи. */
  function brokenStream(): Readable {
    let sent = false;

    return new Readable({
      read() {
        if (sent) {
          this.destroy(new Error('соединение разорвано'));

          return;
        }

        sent = true;
        this.push(MP4_HEAD);
      },
    });
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cairn-recordings-'));
    process.env[RECORDINGS_DIR_ENV] = root;
    store = new RecordingStore();
  });

  afterEach(async () => {
    delete process.env[RECORDINGS_DIR_ENV];
    await rm(root, { recursive: true, force: true });
  });

  it('принимает поток в incoming, потом переносит на место', async () => {
    // Путь попадает в таблицу только после переноса — на этом стоит
    // право убирать incoming/ целиком при подъёме (дизайн, 2.5 п.5).
    const saved = await store.accept(JOB_ID, 'video/mp4', Readable.from([MP4_HEAD, TAIL]), MAX);

    expect(saved.path).toBe(`${JOB_ID}.mp4`);
    expect(saved.bytes).toBe(MP4_HEAD.length + TAIL.length);
    expect(await lsIncoming()).toEqual([]);
    expect(await lsRecordings()).toEqual([`${JOB_ID}.mp4`]);
  });

  it('считает байты по ходу, а не верит Content-Length', async () => {
    // Заголовку верить нельзя: он может и соврать, и отсутствовать.
    await expect(
      store.accept(JOB_ID, 'video/mp4', Readable.from([MP4_HEAD, BIG_TAIL]), 1024),
    ).rejects.toMatchObject({ code: RECORDING_TOO_LARGE });
  });

  it('перебор предела убирает недописанный файл', async () => {
    await expect(
      store.accept(JOB_ID, 'video/mp4', Readable.from([MP4_HEAD, BIG_TAIL]), 1024),
    ).rejects.toThrow();

    expect(await lsIncoming()).toEqual([]);
    expect(await lsRecordings()).toEqual([]);
  });

  it('негодная подпись обрывает приём на первом куске', async () => {
    // Два гигабайта чужого формата на том не попадают: проверяется голова
    // первого куска, и дальше мы перестаём читать.
    const stream = Readable.from([PDF_HEAD, BIG_TAIL]);

    await expect(store.accept(JOB_ID, 'video/mp4', stream, MAX)).rejects.toMatchObject({
      code: RECORDING_NOT_AUDIO,
    });
    // Пауза, а не разрушение, и это не вкус: поток здесь — соединение
    // запроса, а разрушенное соединение отвечает клиенту обрывом вместо
    // названного `400`. Хвост при этом не дочитывается — ровно то, ради
    // чего проверка стоит на первом куске.
    //
    // Сторож самого ответа стоит не здесь, а в HTTP-тесте ручки: живость
    // сокета — свойство соединения, и проверять её на `Readable.from`
    // значило бы проверять внутренности Node вместо своего поведения.
  });

  it('подпись чужого семейства не проходит под своим типом', async () => {
    // mp3, объявленный как mp4: семейство узнано, но объявленному типу
    // не принадлежит.
    await expect(
      store.accept(JOB_ID, 'video/mp4', Readable.from([ID3, TAIL]), MAX),
    ).rejects.toMatchObject({ code: RECORDING_NOT_AUDIO });
  });

  it('обрыв связи убирает недописанный файл', async () => {
    // Единственное место в системе, где уборка идёт в finally, а не
    // после фиксации: строки в базе ещё нет, фиксировать нечего.
    await expect(store.accept(JOB_ID, 'video/mp4', brokenStream(), MAX)).rejects.toThrow();

    expect(await lsIncoming()).toEqual([]);
    expect(await lsRecordings()).toEqual([]);
  });

  it('кладёт запись под именем задачи, а не под присланным', async () => {
    // Присланное имя мы не получаем вовсе; расширение выводится из типа,
    // чтобы файл, вытащенный с тома руками, открылся плеером.
    const saved = await store.accept(JOB_ID, 'audio/mpeg', Readable.from([ID3, TAIL]), MAX);

    expect(saved.path).toBe(`${JOB_ID}.mp3`);
  });

  it('у каждого принимаемого контейнера своё расширение', async () => {
    // Иначе файл с тома не открылся бы плеером — единственное, зачем
    // расширение вообще нужно (дизайн, 3.2).
    expect(store.uploadNameOf(JOB_ID, 'video/quicktime')).toBe(`${JOB_ID}.mov`);
    expect(store.uploadNameOf(JOB_ID, 'video/x-matroska')).toBe(`${JOB_ID}.mkv`);
    expect(store.uploadNameOf(JOB_ID, 'audio/mp4')).toBe(`${JOB_ID}.m4a`);
  });

  it('дорожка кладётся своим именем рядом с загруженным', async () => {
    // Два файла на задачу: собьются расширениями, но не именами.
    expect(store.audioNameOf(JOB_ID)).toBe(`${JOB_ID}.opus`);
  });

  it('не выходит за пределы каталога записей', async () => {
    // Путь строится из идентификатора задачи, но проверка стоит всё
    // равно: хранилище не должно становиться способом прочитать что
    // угодно — а оно отдаёт файлы наружу ручкой.
    await expect(store.read('../../etc/passwd')).rejects.toThrow();
    await expect(store.read('/etc/passwd')).rejects.toThrow();
    expect(() => store.absolutePathOf('../чужое')).toThrow();
  });

  it('отсутствующий файл читается названным отказом', async () => {
    // Законный случай: поднялись из копии базы, тома с записями нет.
    await expect(store.read('нет-такого.mp3')).rejects.toMatchObject({
      code: RECORDING_MISSING,
    });
  });

  it('размер отсутствующего файла — тот же названный отказ', async () => {
    await expect(store.size('нет-такого.opus')).rejects.toMatchObject({
      code: RECORDING_MISSING,
    });
  });

  it('читает то, что приняло, и знает его размер', async () => {
    const saved = await store.accept(JOB_ID, 'audio/wav', Readable.from([WAV]), MAX);

    expect(await store.read(saved.path)).toEqual(WAV);
    expect(await store.size(saved.path)).toBe(WAV.length);
  });

  it('удаление отсутствующего файла ошибкой не считается', async () => {
    // ENOENT значит «уже убран», и это не повод валить уборку саммари.
    await expect(store.remove('нет-такого.mp3')).resolves.toBeUndefined();
  });

  it('удаляет принятую запись', async () => {
    const saved = await store.accept(JOB_ID, 'audio/wav', Readable.from([WAV]), MAX);

    await store.remove(saved.path);

    expect(await lsRecordings()).toEqual([]);
  });

  it('создаёт каталоги, если их нет', async () => {
    // Том монтируется пустым; падать на первой загрузке незачем.
    await rm(root, { recursive: true, force: true });

    await expect(
      store.accept(JOB_ID, 'audio/wav', Readable.from([WAV]), MAX),
    ).resolves.toBeDefined();
  });

  it('отдаёт абсолютный путь для потоковой отдачи', () => {
    // res.sendFile требует абсолютный путь и сам ставит Accept-Ranges.
    expect(isAbsolute(store.absolutePathOf(`${JOB_ID}.opus`))).toBe(true);
  });

  it('убирает incoming целиком при подъёме', async () => {
    // После перезапуска в incoming/ заведомо ничего живого нет: живых
    // запросов у нового процесса не бывает, а в таблицу путь попадает
    // только после переноса.
    await mkdir(join(root, 'incoming'), { recursive: true });
    await writeFile(join(root, 'incoming', 'брошенный.part'), 'остаток');

    await store.sweepIncoming();

    expect(await lsIncoming()).toEqual([]);
  });

  it('уборка incoming не трогает готовые записи', async () => {
    await store.accept(JOB_ID, 'audio/wav', Readable.from([WAV]), MAX);

    await store.sweepIncoming();

    expect(await lsRecordings()).toHaveLength(1);
  });

  it('уборка пустого тома не падает', async () => {
    // Первый подъём на свежем томе: каталога incoming/ ещё нет вовсе.
    await rm(root, { recursive: true, force: true });

    await expect(store.sweepIncoming()).resolves.toBeUndefined();
  });

  it('каталог читается при каждом вызове, а не при создании', async () => {
    // Как настройки порта: иначе смена CAIRN_RECORDINGS_DIR требовала бы
    // перезапуска API, а тесты не могли бы подменить каталог вовсе.
    const other = await mkdtemp(join(tmpdir(), 'cairn-recordings-other-'));

    try {
      process.env[RECORDINGS_DIR_ENV] = other;
      await store.accept(JOB_ID, 'audio/wav', Readable.from([WAV]), MAX);

      expect(await readdir(other)).toContain(`${JOB_ID}.wav`);
      expect(await lsRecordings()).toEqual([]);
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  });
});
