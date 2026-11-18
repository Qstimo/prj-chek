import {
  EXTRACTION_FAILED,
  EXTRACTION_TIMED_OUT,
  RECORDING_BROKEN,
  RECORDING_CODEC_UNSUPPORTED,
  RECORDING_NO_AUDIO_TRACK,
  TRANSCRIPTION_TOO_LARGE,
} from '@cairn/shared';

/** На каком шаге смотрел `ffmpeg`: шаги отказывают по-разному. */
export enum ExtractStage {
  /** `ffprobe`: что внутри файла. Секунды работы, читает заголовки. */
  Probe = 'probe',
  /** `ffmpeg`: извлечение дорожки. Минуты работы. */
  Convert = 'convert',
}

/**
 * Что видно после запуска процесса.
 *
 * Поля необязательны, потому что на разных шагах известно разное: у
 * убитого процесса нет кода выхода, у `ffprobe` нет размера дорожки.
 */
export interface FfmpegOutcome {
  stage: ExtractStage;
  /** Код выхода; `null`/отсутствует — процесс не дошёл до выхода. */
  exitCode?: number | null;
  /** Убит по пределу времени. */
  killed?: boolean;
  /** Хвост `stderr`. Читается ровно в одном месте — см. ниже. */
  stderrTail?: string;
  /** Что увидел `ffprobe`. */
  probe?: { hasAudio: boolean };
  /** Размер вышедшей дорожки. */
  audioBytes?: number;
  /** Предел отправки службе. */
  maxSendBytes?: number;
}

/**
 * Подстроки `ffmpeg`, означающие «декодер не нашёлся».
 *
 * **Единственное место в системе, которое читает чужой текст**, и это
 * названо прямо: такие строки у `ffmpeg` меняются между версиями. Решение
 * принято осознанно — названная причина стоит одного хрупкого сравнения, а
 * если сравнение не сработает, человек получит {@link EXTRACTION_FAILED},
 * то есть правду, только менее полезную. Деградация тихая и в нужную
 * сторону; обратная конструкция — угадывать «кодек» по любому отказу —
 * врала бы (дизайн, 7.6).
 */
const DECODER_MARKERS = ['not found for codec id', 'Unsupported codec'];

/**
 * Превращает исход запуска в названный код отказа либо `null`.
 *
 * Классификация идёт **по кодам выхода и разобранному `JSON` от
 * `ffprobe`**, а не по тексту: исключение одно, оно названо выше и
 * деградирует в честное «не вышло».
 *
 * Три отказа извлечения не сводятся в один общий, потому что человек по
 * ним делает разное: `recording_no_audio_track` — выгрузить созвон заново
 * со звуком, `recording_broken` — выгрузить заново целиком,
 * `extraction_failed` — просто нажать «снова», потому что причина у нас.
 * Один код «не вышло» отправил бы человека делать не то (дизайн, 7.5).
 */
export function ffmpegFailureOf(outcome: FfmpegOutcome): string | null {
  if (outcome.stage === ExtractStage.Probe) {
    // Битый контейнер и отсутствие дорожки различаются тем, дошёл ли
    // `ffprobe` до ответа: первое — «файл не читается», второе — факт о
    // читаемом файле.
    if (outcome.exitCode !== 0) {
      return RECORDING_BROKEN;
    }

    return outcome.probe?.hasAudio === false ? RECORDING_NO_AUDIO_TRACK : null;
  }

  // Убийство по пределу проверяется **прежде** текста `stderr`: предел
  // обрывает `ffmpeg` где угодно, в том числе на строке про кодек, и
  // обратный порядок называл бы причиной чужой кодек там, где причина —
  // наше терпение.
  if (outcome.killed === true) {
    return EXTRACTION_TIMED_OUT;
  }

  if (outcome.exitCode !== 0) {
    return isDecoderFailure(outcome.stderrTail) ? RECORDING_CODEC_UNSUPPORTED : EXTRACTION_FAILED;
  }

  // Дорожка вышла, но созвон слишком длинный: предел отправки — «не
  // больше», та же включительная граница, что у `prepareDecision`.
  if (
    outcome.audioBytes !== undefined &&
    outcome.maxSendBytes !== undefined &&
    outcome.audioBytes > outcome.maxSendBytes
  ) {
    return TRANSCRIPTION_TOO_LARGE;
  }

  return null;
}

/** Виден ли в хвосте `stderr` отказ декодера. */
function isDecoderFailure(stderrTail: string | undefined): boolean {
  const tail = stderrTail ?? '';

  return DECODER_MARKERS.some((marker) => tail.includes(marker));
}
