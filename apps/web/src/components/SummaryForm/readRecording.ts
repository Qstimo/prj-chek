import {
  RECORDING_HEAD_BYTES,
  RECORDING_NOT_AUDIO,
  RECORDING_TOO_LARGE,
  RECORDING_TYPE_NOT_ACCEPTED,
  familyAcceptsType,
  uploadFamilyOf,
  type TranscriberInfo,
} from '@cairn/shared';

/** Отказ чтения записи: код из контракта, а не фраза. */
export class RecordingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'RecordingError';
  }
}

/** Что прочитано у записи. Имени файла здесь нет. */
export interface IReadRecording {
  /** Сам файл: уедет сырым телом запроса. */
  file: File;
  /** Тип содержимого запроса, выведенный из расширения. */
  uploadType: string;
  bytes: number;
}

/**
 * Проверяет запись созвона до отправки или отказывает с кодом.
 *
 * Порядок проверок обязателен и тот же, что у текстового файла первой
 * итерации (дизайн расшифровки, 8.2):
 *
 * 1. **размер** — файл больше предела загрузки не читается **вовсе**: у
 *    записи это уже не риторика, а настоящие два гигабайта;
 * 2. **расширение** — из него берётся `Content-Type` запроса, и оно же
 *    сверяется с `acceptedTypes`, пришедшими с сервера. `File.type`
 *    доказательством не считается: его ставит операционная система по тому
 *    же расширению;
 * 3. **подпись** — первые {@link RECORDING_HEAD_BYTES} байт, семейство
 *    сверяется с объявленным типом. Отказ здесь экономит не минуту
 *    ожидания, а **всю загрузку**: два гигабайта по медленному каналу —
 *    это десятки минут.
 *
 * Настройки идут вторым аргументом целиком, а не одним числом: предел
 * загрузки и список принимаемых контейнеров приходят с сервера вместе, и
 * собирать список в браузере значило бы завести второе место, где живёт
 * правило — на установке без `ffmpeg` оно разошлось бы с серверным первым
 * же форматом.
 *
 * Отказы — объекты с `code` из контракта, а не фразы: экран разбирает код,
 * а фразу можно переписать. Имя файла в результат не попадает: оно никуда
 * не отправляется, а имена файлов на машинах людей нередко говорят больше,
 * чем содержимое.
 */
export async function readRecording(
  file: File,
  settings: TranscriberInfo,
): Promise<IReadRecording> {
  if (file.size > settings.maxUploadBytes) {
    throw new RecordingError(RECORDING_TOO_LARGE);
  }

  const uploadType = typeByExtensionOf(file.name);

  if (uploadType === undefined || !settings.acceptedTypes.includes(uploadType)) {
    throw new RecordingError(RECORDING_TYPE_NOT_ACCEPTED);
  }

  const family = uploadFamilyOf(await headOf(file));

  if (family === null || !familyAcceptsType(family, uploadType)) {
    throw new RecordingError(RECORDING_NOT_AUDIO);
  }

  return { file, uploadType, bytes: file.size };
}

/**
 * Тип содержимого по расширению имени, либо `undefined`.
 *
 * Карта, а не разбор `File.type`: тип запроса ставит веб, и ставит его по
 * расширению — ровно так же, как делает операционная система, только без
 * возможности соврать. Расширения вне карты не принимаются вовсе: взять
 * `Content-Type` было бы не из чего.
 *
 * Разных расширений у одного типа несколько, и это нормально: `.opus` и
 * `.oga` — тот же `OGG`, а `.m4a` — тот же ISO-BMFF, что `.mp4`. Обратно
 * карта не читается и не должна.
 */
function typeByExtensionOf(name: string): string | undefined {
  const lowered = name.toLowerCase();
  const found = Object.entries(TYPE_BY_EXTENSION).find(([extension]) =>
    lowered.endsWith(extension),
  );

  return found?.[1];
}

/** Расширение → тип содержимого запроса. Ключи — ровно широкий список. */
const TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  /** Извлечённая нами дорожка: её же человек может загрузить обратно. */
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.weba': 'audio/webm',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
};

/**
 * Голова файла через `FileReader`, а не `Blob.arrayBuffer()`.
 *
 * Причина внешняя и та же, что у `readTextFile`: в jsdom у `Blob` есть
 * только `slice`, `size` и `type`, и на `arrayBuffer` тест падал бы в
 * среде, а не в браузере.
 */
function headOf(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new RecordingError(RECORDING_NOT_AUDIO));
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(file.slice(0, RECORDING_HEAD_BYTES));
  });
}
