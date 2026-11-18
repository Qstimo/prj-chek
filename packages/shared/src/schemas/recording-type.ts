/**
 * Распознавание контейнера записи созвона по подписи файла.
 *
 * Функция живёт в контракте, а не на сервере, рядом с
 * `normalizeSummaryText` и по той же причине: одна и та же проверка нужна и
 * браузеру (до загрузки), и серверу (как то, чему можно верить). Две
 * реализации разошлись бы, и отказ приходил бы в одном месте, а не в
 * другом.
 *
 * Четыре решения, на которых стоит этот файл (дизайн, раздел 4.1):
 *
 * - **`File.type` доказательством не считается.** Тип ставит операционная
 *   система по расширению, и подделать его ничего не стоит. Поэтому
 *   `Content-Type` запроса ставит сам веб по расширению, а правду выясняет
 *   подпись.
 * - **Подпись проверяется, а не отдаётся на суд `ffprobe`.** Вариант
 *   «пусть судит `ffprobe`» короче на функцию, но хуже: подпись читается по
 *   первым {@link RECORDING_HEAD_BYTES} байтам **в начале загрузки**, и
 *   несовпадение обрывает приём, не дав двум гигабайтам чужого формата
 *   дотечь на том. `ffprobe` судит уже о том, что лежит на диске.
 * - **Ответ — семейство контейнера, а не тип содержимого.** `mp4`, `m4a` и
 *   `mov` подписью не различаются (у всех `ftyp`), `mkv` и `webm` — тоже
 *   (один EBML). Притворяться, что мы их различаем, значило бы отказывать
 *   на честном файле из-за неожиданного бренда внутри `ftyp`. Что лежит
 *   внутри — звук, видео или ни то ни другое — говорит `ffprobe`, и это
 *   ровно его работа (раздел 7.6).
 * - **Проверка `OpusHead` не исчезла, а переехала.** В первой редакции
 *   дизайна `OGG` без Opus отвергался на загрузке, потому что отдавать
 *   службе было нечего. Теперь `OGG/Vorbis` принимается и перекодируется, а
 *   строгая проверка `OpusHead` живёт там, где решается «можно отдать как
 *   есть» (`prepareDecision`, раздел 7.6).
 */

/**
 * Сколько байт головы файла нужно для решения.
 *
 * Экспортируемая константа, а не число в двух местах: браузер по ней режет
 * `file.slice`, сервер по ней берёт голову первого куска потока, и второе
 * число неизбежно разошлось бы с первым.
 */
export const RECORDING_HEAD_BYTES = 64;

/**
 * Семейство контейнера: то, что различимо подписью.
 *
 * Не тип содержимого и не кодек: внутри `iso-bmff` может лежать и видео
 * демонстрации экрана, и дорожка с диктофона.
 */
export enum UploadFamily {
  /** MP3: тег `ID3` либо сразу байты синхронизации кадра. */
  MpegAudio = 'mpeg-audio',
  /** WAV: `RIFF` с типом `WAVE`. */
  RiffWave = 'riff-wave',
  /** OGG: `OggS`. Что внутри — Opus или Vorbis — подпись не говорит. */
  Ogg = 'ogg',
  /** FLAC: `fLaC`. */
  Flac = 'flac',
  /** ISO-BMFF: `ftyp` на смещении 4. Так начинаются mp4, m4a и mov. */
  IsoBmff = 'iso-bmff',
  /** EBML: так начинаются mkv и webm. */
  Matroska = 'matroska',
}

/**
 * Какому семейству принадлежит объявленный тип содержимого.
 *
 * Карта односторонняя: у семейства типов много, у типа семейство одно.
 * Ключи — ровно широкий список загрузки (`UPLOAD_TYPES`); тип вне карты не
 * принадлежит ни одному семейству, и это правильный ответ, а не «не знаю»:
 * иначе `video/x-msvideo` прошёл бы проверку подписи.
 */
export const FAMILY_BY_TYPE: Readonly<Record<string, UploadFamily>> = {
  'audio/mpeg': UploadFamily.MpegAudio,
  'audio/ogg': UploadFamily.Ogg,
  'audio/wav': UploadFamily.RiffWave,
  'audio/mp4': UploadFamily.IsoBmff,
  'audio/flac': UploadFamily.Flac,
  'audio/webm': UploadFamily.Matroska,
  'video/mp4': UploadFamily.IsoBmff,
  'video/quicktime': UploadFamily.IsoBmff,
  'video/x-matroska': UploadFamily.Matroska,
  'video/webm': UploadFamily.Matroska,
};

/**
 * Совпадают ли байты головы с подписью, начиная со смещения.
 *
 * Проверки длины здесь нет намеренно: чтение за пределами `Uint8Array`
 * даёт `undefined`, а `undefined` не равен ни одному байту подписи, —
 * значит короткая голова не совпадает сама собой. Отдельное условие на
 * длину было бы недостижимой ветвью, то есть кодом, который нечем
 * проверить.
 */
function matches(head: Uint8Array, offset: number, signature: readonly number[]): boolean {
  return signature.every((byte, index) => head[offset + index] === byte);
}

/** `ID3` — тег в начале MP3. */
const ID3 = [0x49, 0x44, 0x33];
const RIFF = [0x52, 0x49, 0x46, 0x46];
/** `WAVE` — тип RIFF-контейнера, на смещении 8 после четырёх байт размера. */
const WAVE = [0x57, 0x41, 0x56, 0x45];
const OGGS = [0x4f, 0x67, 0x67, 0x53];
const FLAC = [0x66, 0x4c, 0x61, 0x43];
/** `ftyp` — бокс типа ISO-BMFF, на смещении 4 после четырёх байт размера. */
const FTYP = [0x66, 0x74, 0x79, 0x70];
const EBML = [0x1a, 0x45, 0xdf, 0xa3];

/** Синхронизация кадра MPEG: `0xFF` и три старших бита следующего байта. */
function isMpegFrameSync(head: Uint8Array): boolean {
  const [first, second] = head;

  if (first !== 0xff || second === undefined) {
    return false;
  }

  // Так пишут конвертеры, не ставящие тега ID3 вовсе.
  return (second & 0xe0) === 0xe0;
}

/**
 * Семейство контейнера по голове файла, либо `null`, если подпись чужая.
 *
 * Не бросает: негодный файл — обычный случай, а не авария. Пустая и
 * слишком короткая голова тоже дают `null`.
 */
export function uploadFamilyOf(head: Uint8Array): UploadFamily | null {
  if (matches(head, 0, ID3) || isMpegFrameSync(head)) {
    return UploadFamily.MpegAudio;
  }

  // RIFF — контейнер общего вида: так начинается и AVI, поэтому тип
  // проверяется отдельно от подписи.
  if (matches(head, 0, RIFF) && matches(head, 8, WAVE)) {
    return UploadFamily.RiffWave;
  }

  if (matches(head, 0, OGGS)) {
    return UploadFamily.Ogg;
  }

  if (matches(head, 0, FLAC)) {
    return UploadFamily.Flac;
  }

  if (matches(head, 4, FTYP)) {
    return UploadFamily.IsoBmff;
  }

  if (matches(head, 0, EBML)) {
    return UploadFamily.Matroska;
  }

  return null;
}

/**
 * Принадлежит ли объявленный тип содержимого этому семейству.
 *
 * Так проверяется объявленный `Content-Type` против распознанной подписи:
 * семейство узнано по байтам, а тип прислан, и расхождение означает
 * `recording_not_audio`.
 */
export function familyAcceptsType(family: UploadFamily, type: string): boolean {
  return FAMILY_BY_TYPE[type] === family;
}
