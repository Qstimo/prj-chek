import {
  EXTRACTION_FAILED,
  EXTRACTION_TIMED_OUT,
  RECORDING_BROKEN,
  RECORDING_CODEC_UNSUPPORTED,
  RECORDING_NEEDS_FFMPEG,
  SERVICE_AUDIO_TYPES,
  TRANSCRIPTION_TOO_LARGE,
  UPLOAD_TYPES,
} from '@cairn/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExtractionFailure, type ProcessOutcome, type ProcessRunner } from './extractor';
import { FfmpegExtractor, ffmpegCommandsOf } from './ffmpeg.extractor';
import { RecordingStore } from './recording-store';
import { RECORDING_AUDIO_BITRATE_ENV, TRANSCRIBER_MAX_BYTES_ENV } from './settings';
import { UnavailableExtractor } from './unavailable.extractor';

/** Задача, от имени которой идёт извлечение. */
const JOB_ID = '00000000-0000-0000-0000-000000000001';

/** Загруженный файл внутри каталога записей. */
const UPLOAD = `${JOB_ID}.mp4`;

/** Ответ `ffprobe` на файл со звуком: ровно те поля, что мы спрашиваем. */
const PROBE_JSON = JSON.stringify({
  streams: [{ codec_name: 'aac' }],
  format: { duration: '3600.5' },
});

/** Исход запуска по умолчанию: процесс отработал и ничего не сказал. */
const OK: ProcessOutcome = { stdout: '', stderrTail: '', exitCode: 0, killed: false };

describe('адаптер ffmpeg', () => {
  let store: RecordingStore;
  let run: ReturnType<typeof vi.fn>;
  let extractor: FfmpegExtractor;
  let outcome: ProcessOutcome;
  let removed: string[];
  let signals: AbortSignal[];
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {
      [RECORDING_AUDIO_BITRATE_ENV]: process.env[RECORDING_AUDIO_BITRATE_ENV],
      [TRANSCRIBER_MAX_BYTES_ENV]: process.env[TRANSCRIBER_MAX_BYTES_ENV],
    };
    delete process.env[RECORDING_AUDIO_BITRATE_ENV];
    delete process.env[TRANSCRIBER_MAX_BYTES_ENV];

    store = new RecordingStore();
    removed = [];
    signals = [];
    outcome = OK;

    vi.spyOn(store, 'size').mockResolvedValue(11_534_336);
    vi.spyOn(store, 'remove').mockImplementation(async (path: string) => {
      removed.push(path);
    });

    // Запуск процесса — внедряемая функция, а не `child_process`: ни один
    // тест не запускает `ffmpeg` (запрет 3 плана).
    run = vi.fn((_command: string, _args: string[], signal: AbortSignal) => {
      signals.push(signal);

      return Promise.resolve(outcome);
    });

    extractor = new FfmpegExtractor(
      { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' },
      store,
      run as unknown as ProcessRunner,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();

    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  /** Аргументы последнего запуска. */
  function args(): string[] {
    return run.mock.calls[run.mock.calls.length - 1]![1] as string[];
  }

  it('доступен и принимает весь широкий список', () => {
    expect(extractor.isAvailable).toBe(true);
    expect(extractor.acceptedTypes).toEqual([...UPLOAD_TYPES]);
  });

  it('битрейт берёт из настройки, а не из своего кода', () => {
    process.env[RECORDING_AUDIO_BITRATE_ENV] = '32k';

    expect(extractor.bitrate).toBe('32k');
  });

  it('зовёт ffprobe массивом аргументов, без оболочки', async () => {
    // Массив не запускает оболочку вовсе, значит имя файла не может
    // быть истолковано как команда.
    outcome = { ...OK, stdout: PROBE_JSON };

    await extractor.probe(UPLOAD, AbortSignal.timeout(1000));

    expect(run.mock.calls[0]![0]).toBe('ffprobe');
    expect(Array.isArray(args())).toBe(true);
    expect(args()).toEqual(expect.arrayContaining(['-select_streams', 'a:0']));
  });

  it('ставит -- перед путями', async () => {
    // Путь, начинающийся с дефиса, иначе был бы прочитан как ключ.
    outcome = { ...OK, stdout: PROBE_JSON };

    await extractor.probe(UPLOAD, AbortSignal.timeout(1000));

    expect(args()[args().length - 2]).toBe('--');
  });

  it('отдаёт путь внутри каталога записей, а не присланный', async () => {
    // Порт не принимает произвольного адреса: путь склеивается из
    // каталога и имени файла, и ничего извне не берётся.
    outcome = { ...OK, stdout: PROBE_JSON };

    await extractor.probe(UPLOAD, AbortSignal.timeout(1000));

    expect(args()[args().length - 1]).toBe(store.absolutePathOf(UPLOAD));
  });

  it('читает из ffprobe дорожку, кодек и длительность', async () => {
    outcome = { ...OK, stdout: PROBE_JSON };

    const probe = await extractor.probe(UPLOAD, AbortSignal.timeout(1000));

    expect(probe).toEqual({ hasAudio: true, audioCodec: 'aac', durationSeconds: 3600.5 });
  });

  it('файл без звука — это факт, а не отказ', async () => {
    // `probe` отвечает фактом о читаемом файле: решение по нему
    // принимает классификация, а не адаптер.
    outcome = { ...OK, stdout: JSON.stringify({ streams: [], format: {} }) };

    const probe = await extractor.probe(UPLOAD, AbortSignal.timeout(1000));

    expect(probe).toEqual({ hasAudio: false, audioCodec: null, durationSeconds: null });
  });

  it('упавший ffprobe — битый контейнер', async () => {
    outcome = { ...OK, exitCode: 1, stderrTail: 'Invalid data found when processing input' };

    await expect(extractor.probe(UPLOAD, AbortSignal.timeout(1000))).rejects.toMatchObject({
      code: RECORDING_BROKEN,
    });
  });

  it('нечитаемый ответ ffprobe — тоже битый контейнер', async () => {
    // Отличать «не разобрался JSON» от «не разобрался файл» незачем:
    // исход один, и причина у него одна.
    outcome = { ...OK, stdout: 'не json' };

    await expect(extractor.probe(UPLOAD, AbortSignal.timeout(1000))).rejects.toMatchObject({
      code: RECORDING_BROKEN,
    });
  });

  it('отбрасывает видео явно и сводит в моно 16 кГц', async () => {
    // -vn не оптимизация: мы заявили, что кадры не разбираем, и флаг —
    // то место, где заявление исполняется.
    await extractor.extract(UPLOAD, JOB_ID, AbortSignal.timeout(1000));

    expect(args()).toEqual(expect.arrayContaining(['-vn', '-ac', '1', '-ar', '16000']));
  });

  it('кодирует в libopus с заданным битрейтом', async () => {
    // Не WAV: 16 кГц моно 16 бит — это 115 МБ на час, и часовой созвон
    // мимо предела тела запроса (дизайн, 3.6).
    await extractor.extract(UPLOAD, JOB_ID, AbortSignal.timeout(1000));

    expect(args()).toEqual(expect.arrayContaining(['-c:a', 'libopus', '-b:a', '24k']));
  });

  it('запускается с -nostdin', async () => {
    // Без него ffmpeg на некоторых входах читает с терминала и висит
    // навсегда: предел убьёт его, но отказ будет без причины.
    await extractor.extract(UPLOAD, JOB_ID, AbortSignal.timeout(1000));

    expect(args()).toContain('-nostdin');
  });

  it('пишет дорожку своим именем после --', async () => {
    const saved = await extractor.extract(UPLOAD, JOB_ID, AbortSignal.timeout(1000));

    expect(args()[args().length - 2]).toBe('--');
    expect(args()[args().length - 1]).toBe(store.absolutePathOf(store.audioNameOf(JOB_ID)));
    expect(saved).toEqual({
      path: store.audioNameOf(JOB_ID),
      bytes: 11_534_336,
      type: 'audio/ogg',
    });
  });

  it('stderr уходит в лог и не попадает в отказ', async () => {
    // В нём бывают пути, имена кодеков и обрывки содержимого.
    outcome = {
      ...OK,
      exitCode: 1,
      stderrTail: '/var/lib/cairn/recordings/j.mp4: Invalid data',
    };

    const failure = (await extractor
      .extract(UPLOAD, JOB_ID, AbortSignal.timeout(1000))
      .then(() => null)
      .catch((error: unknown) => error)) as ExtractionFailure;

    expect(failure.code).toBe(EXTRACTION_FAILED);
    expect(failure.message).not.toContain('/var/lib/cairn');
    expect(failure.cause).toBeUndefined();
  });

  it('отказ декодера называется своим кодом', async () => {
    outcome = { ...OK, exitCode: 1, stderrTail: 'Unsupported codec with id 86076' };

    await expect(extractor.extract(UPLOAD, JOB_ID, AbortSignal.timeout(1000))).rejects.toMatchObject(
      { code: RECORDING_CODEC_UNSUPPORTED },
    );
  });

  it('убитый по пределу процесс даёт названный отказ', async () => {
    outcome = { ...OK, exitCode: null, killed: true };

    await expect(extractor.extract(UPLOAD, JOB_ID, AbortSignal.timeout(1000))).rejects.toMatchObject(
      { code: EXTRACTION_TIMED_OUT },
    );
  });

  it('свой предел времени доезжает до процесса', async () => {
    // Убивает процесс сам `AbortSignal`, переданный в запуск, — и
    // полагаться на это надо явно, тестом, а не по памяти.
    const caller = new AbortController();

    caller.abort();

    await extractor.extract(UPLOAD, JOB_ID, caller.signal).catch(() => undefined);

    expect(signals[0]!.aborted).toBe(true);
  });

  it('недописанный выход убирается при отказе', async () => {
    // Остаток прошлой попытки иначе был бы принят за готовую дорожку:
    // ffmpeg писал в тот же путь.
    outcome = { ...OK, exitCode: 1 };

    await expect(extractor.extract(UPLOAD, JOB_ID, AbortSignal.timeout(1000))).rejects.toThrow();
    expect(removed).toContain(store.audioNameOf(JOB_ID));
  });

  it('дорожка больше предела отправки убирается и названа', async () => {
    process.env[TRANSCRIBER_MAX_BYTES_ENV] = '1000';

    await expect(extractor.extract(UPLOAD, JOB_ID, AbortSignal.timeout(1000))).rejects.toMatchObject(
      { code: TRANSCRIPTION_TOO_LARGE },
    );
    expect(removed).toContain(store.audioNameOf(JOB_ID));
  });

  it('успех ничего не убирает', async () => {
    await extractor.extract(UPLOAD, JOB_ID, AbortSignal.timeout(1000));

    expect(removed).toEqual([]);
  });
});

describe('разрешение исполняемых файлов', () => {
  it('off выключает извлечение, не спрашивая файловую систему', () => {
    expect(ffmpegCommandsOf('off')).toBeNull();
  });

  it('несуществующий путь даёт недоступность, а не аварию при старте', () => {
    // Опечатка в пути — обычный случай, и падать на подъёме из-за неё
    // значило бы уронить всю установку ради необязательной возможности.
    expect(ffmpegCommandsOf('/нет/такого/ffmpeg')).toBeNull();
  });

  it('названный путь без ffprobe рядом не годится', () => {
    // `ffprobe` обязателен вместе с `ffmpeg`: без него не ответить, есть
    // ли в файле звук, — а это разница между «выгрузите заново со
    // звуком» и «нажмите снова». Подставлен настоящий существующий файл
    // (сам node), рядом с которым `ffprobe` заведомо не лежит.
    expect(ffmpegCommandsOf(process.execPath)).toBeNull();
  });
});

describe('извлечение недоступно', () => {
  const unavailable = new UnavailableExtractor();

  it('отвечает недоступным и отказывает названным кодом', async () => {
    expect(unavailable.isAvailable).toBe(false);

    await expect(
      unavailable.extract(UPLOAD, JOB_ID, AbortSignal.timeout(1000)),
    ).rejects.toMatchObject({ code: RECORDING_NEEDS_FFMPEG });
    await expect(unavailable.probe(UPLOAD, AbortSignal.timeout(1000))).rejects.toMatchObject({
      code: RECORDING_NEEDS_FFMPEG,
    });
  });

  it('принимаемый список сужается до того, что берёт служба', () => {
    expect(unavailable.acceptedTypes).toEqual([...SERVICE_AUDIO_TYPES]);
  });

  it('битрейта не называет: перекодировать нечем', () => {
    expect(unavailable.bitrate).toBeNull();
  });
});
