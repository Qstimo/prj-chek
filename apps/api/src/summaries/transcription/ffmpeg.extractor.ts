import { RECORDING_BROKEN, UPLOAD_TYPES } from '@cairn/shared';
import { Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

import {
  ExtractionFailure,
  type AudioExtractor,
  type ExtractedAudio,
  type MediaProbe,
  type ProcessOutcome,
  type ProcessRunner,
} from './extractor';
import { ExtractStage, ffmpegFailureOf } from './ffmpeg-failure';
import type { RecordingStore } from './recording-store';
import { FFMPEG_AUTO, FFMPEG_OFF, transcriberSettings } from './settings';

/** Тип извлечённой дорожки: `OGG/Opus`, моно, 16 кГц. */
const AUDIO_TYPE = 'audio/ogg';

/** Сколько знаков `stderr` держим: больше не нужно и в куче не нужно. */
const STDERR_TAIL_CHARS = 4_000;

/** Исполняемые файлы, разрешённые фабрикой один раз при старте. */
export interface FfmpegCommands {
  ffmpeg: string;
  ffprobe: string;
}

/** Ответ `ffprobe -of json` в той части, которую мы спрашиваем. */
interface ProbePayload {
  streams?: { codec_name?: unknown }[];
  format?: { duration?: unknown };
}

/**
 * Извлечение дорожки через `ffprobe` и `ffmpeg` дочерним процессом.
 *
 * **Первый внешний процесс, который запускает API** — образца рядом нет, и
 * отсюда три решения, которые иначе выглядели бы перестраховкой: аргументы
 * массивом (оболочка не запускается вовсе), `--` перед путями (путь с
 * дефиса иначе прочли бы как ключ) и `stderr` только в лог (в нём бывают
 * пути, имена кодеков и обрывки содержимого) — дизайн, 7.6.
 *
 * Настройки потока (битрейт, предел отправки, предел времени) читаются
 * **при каждом вызове**, а разрешённые исполняемые файлы приходят в
 * конструктор: «есть ли файл» — вопрос к файловой системе, и задавать его
 * на каждую загрузку значило бы ходить на диск ради того, что за время
 * жизни процесса не меняется (дизайн, 7.4).
 *
 * Пути берутся только из хранилища: порт склеивает их из каталога записей
 * и имени файла и ничего не принимает извне — иначе он стал бы способом
 * заставить сервер прочитать что угодно.
 */
export class FfmpegExtractor implements AudioExtractor {
  private readonly logger = new Logger(FfmpegExtractor.name);

  constructor(
    private readonly commands: FfmpegCommands,
    private readonly store: RecordingStore,
    private readonly run: ProcessRunner = spawnRunner,
  ) {}

  get isAvailable(): boolean {
    return true;
  }

  get bitrate(): string {
    return transcriberSettings().audioBitrate;
  }

  get acceptedTypes(): string[] {
    return [...UPLOAD_TYPES];
  }

  /**
   * Спрашивает `ffprobe`, что внутри файла.
   *
   * Отсутствие дорожки — **факт о читаемом файле**, и потому возвращается,
   * а не бросается: решение по нему принимает классификация
   * (`ffmpegFailureOf`), которой видно и стадию, и исход. Нечитаемый файл
   * — другое дело: факта нет, возвращать нечего, и единственный честный
   * ответ — отказ `recording_broken`.
   */
  async probe(uploadPath: string, signal: AbortSignal): Promise<MediaProbe> {
    const input = this.store.absolutePathOf(uploadPath);
    const outcome = await this.launch(
      this.commands.ffprobe,
      [
        '-v',
        'error',
        '-select_streams',
        'a:0',
        '-show_entries',
        'stream=codec_name',
        '-show_entries',
        'format=duration',
        '-of',
        'json',
        '--',
        input,
      ],
      signal,
    );

    const code = ffmpegFailureOf({ stage: ExtractStage.Probe, exitCode: outcome.exitCode });

    if (code !== null) {
      throw this.failure(code, 'Запись не читается', outcome);
    }

    return this.probeOf(outcome);
  }

  /**
   * Извлекает дорожку в `OGG/Opus`, моно, 16 кГц.
   *
   * Недописанный выход убирается при любом отказе: `ffmpeg` писал в тот же
   * путь, и остаток прошлой попытки был бы принят за готовую дорожку. Это
   * **единственное**, что уносит отказ извлечения: загруженный файл
   * остаётся на томе всегда, потому что отказ — не повод терять то, что
   * человек уже загрузил по медленному каналу (дизайн, 7.5).
   */
  async extract(uploadPath: string, jobId: string, signal: AbortSignal): Promise<ExtractedAudio> {
    const settings = transcriberSettings();
    const name = this.store.audioNameOf(jobId);
    const input = this.store.absolutePathOf(uploadPath);
    const output = this.store.absolutePathOf(name);
    const outcome = await this.launch(
      this.commands.ffmpeg,
      [
        '-v',
        'error',
        // Без него ffmpeg на некоторых входах читает с терминала и висит
        // навсегда: предел убьёт его, но отказ будет без причины.
        '-nostdin',
        '-y',
        '-i',
        input,
        // Видеопоток отбрасывается явно: мы заявили, что кадров не
        // разбираем, и флаг — то место, где заявление исполняется.
        '-vn',
        // Моно и 16 кГц: распознаванию речи больше не нужно, а размер
        // падает кратно. Моно означает и то, что сведения о каналах
        // теряются намеренно — диаризации нет по решению владельца.
        '-ac',
        '1',
        '-ar',
        '16000',
        '-c:a',
        'libopus',
        '-b:a',
        settings.audioBitrate,
        '--',
        output,
      ],
      signal,
      settings.extractMinutes,
    );

    const bytes = outcome.exitCode === 0 && !outcome.killed ? await this.sizeOf(name) : null;
    const code = ffmpegFailureOf({
      stage: ExtractStage.Convert,
      exitCode: outcome.exitCode,
      killed: outcome.killed,
      stderrTail: outcome.stderrTail,
      audioBytes: bytes ?? undefined,
      maxSendBytes: settings.maxSendBytes,
    });

    if (code !== null || bytes === null) {
      // Уборка идёт до броска: держать её в `finally` незачем, потому что
      // успешная ветка ниже ничего не убирает.
      await this.store.remove(name).catch(() => undefined);

      throw this.failure(code ?? RECORDING_BROKEN, 'Не удалось извлечь звуковую дорожку', outcome);
    }

    return { path: name, bytes, type: AUDIO_TYPE };
  }

  /**
   * Запускает процесс со своим пределом времени поверх чужого сигнала.
   *
   * Предел — свой, из настроек: адаптер единственный, кто знает, сколько
   * минут готов отдать перекодированию. Убивает процесс сам
   * `AbortSignal`, переданный в запуск, и полагаться на это надо явно —
   * тестом, а не по памяти (дизайн, 7.6).
   */
  private launch(
    command: string,
    args: string[],
    signal: AbortSignal,
    minutes?: number,
  ): Promise<ProcessOutcome> {
    const limit = minutes ?? transcriberSettings().extractMinutes;

    return this.run(command, args, AbortSignal.any([signal, AbortSignal.timeout(limit * 60_000)]));
  }

  /** Размер вышедшей дорожки; файла нет — `null`, то есть «не вышло». */
  private async sizeOf(name: string): Promise<number | null> {
    try {
      return await this.store.size(name);
    } catch {
      // `ffmpeg` отработал нулём, а файла нет: исход один — «не вышло».
      return null;
    }
  }

  /** Разбирает ответ `ffprobe`; нечитаемый ответ — битый контейнер. */
  private probeOf(outcome: ProcessOutcome): MediaProbe {
    let payload: ProbePayload;

    try {
      payload = JSON.parse(outcome.stdout) as ProbePayload;
    } catch {
      throw this.failure(RECORDING_BROKEN, 'Запись не читается', outcome);
    }

    const codec = payload.streams?.[0]?.codec_name;
    const duration = Number(payload.format?.duration);

    return {
      hasAudio: typeof codec === 'string' && codec !== '',
      audioCodec: typeof codec === 'string' && codec !== '' ? codec : null,
      durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
    };
  }

  /**
   * Отказ с безопасным сообщением; `stderr` уходит **только в лог**.
   *
   * То же правило, по которому тело чужого ответа не разворачивается в
   * ответ ручки: наружу идёт код из классификации, а не чужой текст.
   */
  private failure(code: string, message: string, outcome: ProcessOutcome): ExtractionFailure {
    if (outcome.stderrTail !== '') {
      this.logger.warn(`Извлечение (${code}): ${outcome.stderrTail}`);
    }

    return new ExtractionFailure(code, `${message} (${code}).`);
  }
}

/**
 * Разрешает настройку `CAIRN_RECORDING_FFMPEG` в пару исполняемых файлов.
 *
 * Зовётся **один раз при старте**, фабрикой порта: «есть ли исполняемый
 * файл» — вопрос к файловой системе, и задавать его на каждую загрузку
 * значило бы ходить на диск ради того, что за время жизни процесса не
 * меняется (дизайн, 7.4).
 *
 * `null` означает «извлечение недоступно», и три повода неразличимы
 * намеренно: `off`, отсутствие `ffmpeg` и отсутствие `ffprobe` рядом с ним.
 * Человеку во всех трёх случаях говорится одно и то же, а установка
 * остаётся рабочей, только уже.
 *
 * `ffprobe` обязателен вместе с `ffmpeg`: без него не ответить, есть ли в
 * файле звук, — а это разница между «выгрузите созвон заново со звуком» и
 * «нажмите снова».
 */
export function ffmpegCommandsOf(setting: string): FfmpegCommands | null {
  if (setting === FFMPEG_OFF) {
    return null;
  }

  if (setting === FFMPEG_AUTO) {
    const ffmpeg = inPath('ffmpeg');
    const ffprobe = inPath('ffprobe');

    return ffmpeg !== null && ffprobe !== null ? { ffmpeg, ffprobe } : null;
  }

  if (!existsSync(setting)) {
    return null;
  }

  // Названный путь говорит о `ffmpeg`; `ffprobe` ищется рядом с ним, а не
  // в `PATH`: администратор, положивший сборку в свой каталог, имел в виду
  // её целиком, а не её половину вперемешку с системной.
  const probe = withExecutableSuffix(join(dirname(setting), 'ffprobe')).find((candidate) =>
    existsSync(candidate),
  );

  return probe === undefined ? null : { ffmpeg: setting, ffprobe: probe };
}

/** Исполняемый файл в `PATH` либо `null`. */
function inPath(name: string): string | null {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter((dir) => dir !== '');

  for (const dir of dirs) {
    const found = withExecutableSuffix(join(dir, name)).find((candidate) => existsSync(candidate));

    if (found !== undefined) {
      return found;
    }
  }

  return null;
}

/**
 * Имя файла со всеми расширениями, которые на этой системе исполняемы.
 *
 * Windows здесь не прихоть: разработка идёт на ней, и `ffmpeg` там
 * называется `ffmpeg.exe`. Поиск без расширений нашёл бы его только в
 * контейнере.
 */
function withExecutableSuffix(path: string): string[] {
  if (process.platform !== 'win32') {
    return [path];
  }

  const suffixes = (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';').filter((ext) => ext !== '');

  return [path, ...suffixes.map((ext) => `${path}${ext.toLowerCase()}`)];
}

/**
 * Настоящий запуск процесса: `spawn` массивом, без оболочки.
 *
 * Живёт рядом с адаптером и не покрыт тестом намеренно: запустить его
 * значило бы запустить `ffmpeg`, а это запрет плана. Проверяется он живой
 * установкой, как и сам `ffmpeg` в образе.
 */
export const spawnRunner: ProcessRunner = (command, args, signal) =>
  new Promise((done, fail) => {
    const child = spawn(command, args, { signal, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderrTail = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      // Хвост, а не всё: `ffmpeg` на негодном входе пишет тысячи строк.
      stderrTail = (stderrTail + chunk.toString('utf8')).slice(-STDERR_TAIL_CHARS);
    });

    child.on('error', (error: NodeJS.ErrnoException) => {
      // Прерывание сигналом — это наш предел времени, а не авария: исход
      // у него названный, и отличить его должна классификация.
      if (error.name === 'AbortError') {
        done({ stdout, stderrTail, exitCode: null, killed: true });

        return;
      }

      fail(error);
    });

    child.on('close', (code, signalName) => {
      done({ stdout, stderrTail, exitCode: code, killed: signalName !== null });
    });
  });
