import {
  DEFAULT_MAX_SEND_BYTES,
  DEFAULT_MAX_UPLOAD_BYTES,
  ModelAuthScheme,
  TranscriberKind,
} from '@cairn/shared';

import { hostOf } from '../suggester/settings';

/**
 * Настройки расшифровки записи созвона (дизайн, раздел 7.4).
 *
 * Тринадцать переменных одной функцией, и они делятся надвое по тому же
 * правилу, которым поделены настройки предложителя (дизайн настройки служб
 * модели, 7.1):
 *
 * - **узел** — «как дойти, чем представиться, что спросить, сколько ждать»
 *   ({@link TRANSCRIBER_NODE_ENV_NAMES}). Для него окружение — **запасной**
 *   источник: оно действует, пока в `model_services` нет строки этого узла.
 *   Старшинство базы над окружением решает одна
 *   `ModelServiceSettingsService`, и разбор здесь ничего о ней не знает;
 * - **поведение нашего потока** — пределы, частота тика, битрейт дорожки,
 *   терпение к `ffmpeg`. Оно остаётся в окружении всегда, потому что при
 *   смене провайдера не меняется.
 *
 * `CAIRN_RECORDINGS_DIR` здесь не читается: каталог тома нужен ровно
 * `RecordingStore`, и второе место, читающее ту же переменную, разошлось бы
 * с первым.
 *
 * Значения читаются при каждом вызове, а не при загрузке модуля: иначе
 * настройка зависела бы от порядка импортов, а тесты не могли бы её менять.
 * Мусор и неположительное означают умолчание, а не «ждать вечно»: порт
 * уходит в сеть и стоит денег.
 */

/** Вид службы: куда уходит запись. Третье значение — `off`. */
export const TRANSCRIBER_KIND_ENV = 'CAIRN_TRANSCRIBER';
/** Адрес службы распознавания. */
export const TRANSCRIBER_BASE_URL_ENV = 'CAIRN_TRANSCRIBER_BASE_URL';
/** Ключ API. Пусто при `external` означает «порт выключен». */
export const TRANSCRIBER_API_KEY_ENV = 'CAIRN_TRANSCRIBER_API_KEY';
/** Каталог Yandex Cloud: уходит заголовком `x-folder-id`. */
export const TRANSCRIBER_FOLDER_ENV = 'CAIRN_TRANSCRIBER_FOLDER_ID';
/** Модель распознавания — настройкой, не кодом. */
export const TRANSCRIBER_MODEL_ENV = 'CAIRN_TRANSCRIBER_MODEL';
/** Предел ожидания **одного обмена**, не всей расшифровки. */
export const TRANSCRIBER_TIMEOUT_ENV = 'CAIRN_TRANSCRIBER_TIMEOUT_SECONDS';
/** Предел отправки службе: больше этого она не возьмёт. */
export const TRANSCRIBER_MAX_BYTES_ENV = 'CAIRN_TRANSCRIBER_MAX_BYTES';
/** Как часто идёт тик прогона; `0` — цикл выключен. */
export const TRANSCRIPTION_POLL_ENV = 'CAIRN_TRANSCRIPTION_POLL_SECONDS';
/** Сколько ждать одну расшифровку, прежде чем признать неудачей. */
export const TRANSCRIPTION_MAX_MINUTES_ENV = 'CAIRN_TRANSCRIPTION_MAX_MINUTES';
/** Предел **загрузки**: что принимает ручка приёма записи. */
export const RECORDING_MAX_BYTES_ENV = 'CAIRN_RECORDING_MAX_BYTES';
/** `auto` / `off` / путь к исполняемому файлу. */
export const RECORDING_FFMPEG_ENV = 'CAIRN_RECORDING_FFMPEG';
/** Битрейт извлекаемой дорожки. */
export const RECORDING_AUDIO_BITRATE_ENV = 'CAIRN_RECORDING_AUDIO_BITRATE';
/** Сколько ждать `ffmpeg`, прежде чем убить его. */
export const RECORDING_EXTRACT_MINUTES_ENV = 'CAIRN_RECORDING_EXTRACT_MINUTES';

/** Выключатель порта целиком: третье значение вида. */
export const TRANSCRIBER_OFF = 'off';

/** Искать `ffmpeg` в `PATH` при старте. */
export const FFMPEG_AUTO = 'auto';

/** Извлечение выключено решением администратора. */
export const FFMPEG_OFF = 'off';

/**
 * Переменные, задающие **узел**, — в порядке полей формы.
 *
 * Экран администрирования называет их дважды: как действующий источник и
 * как «эти переменные больше не действуют». Пределов потока в списке нет
 * намеренно: они действуют всегда, потому что описывают поведение нашего
 * потока, а не свойство узла, и назвать их недействующими значило бы
 * соврать.
 */
export const TRANSCRIBER_NODE_ENV_NAMES = [
  TRANSCRIBER_KIND_ENV,
  TRANSCRIBER_BASE_URL_ENV,
  TRANSCRIBER_API_KEY_ENV,
  TRANSCRIBER_FOLDER_ENV,
  TRANSCRIBER_MODEL_ENV,
  TRANSCRIBER_TIMEOUT_ENV,
];

/**
 * Все переменные расшифровки: узел и поведение потока вместе.
 *
 * Экспортируется, потому что тест обязан вычистить **все** до одной: ключ,
 * оставленный соседним тестом, включал бы порт там, где проверяется
 * выключенный. Перечисление в тесте разошлось бы с этим при первой правке.
 */
export const TRANSCRIPTION_ENV_NAMES = [
  ...TRANSCRIBER_NODE_ENV_NAMES,
  TRANSCRIBER_MAX_BYTES_ENV,
  TRANSCRIPTION_POLL_ENV,
  TRANSCRIPTION_MAX_MINUTES_ENV,
  RECORDING_MAX_BYTES_ENV,
  RECORDING_FFMPEG_ENV,
  RECORDING_AUDIO_BITRATE_ENV,
  RECORDING_EXTRACT_MINUTES_ENV,
];

/** Адрес SpeechKit по умолчанию. У `local` умолчания адреса нет. */
export const TRANSCRIBER_EXTERNAL_BASE_URL = 'https://stt.api.cloud.yandex.net';

/** Модель распознавания по умолчанию. */
export const DEFAULT_TRANSCRIBER_MODEL = 'general';

/** Предел ожидания одного обмена по умолчанию, в секундах. */
export const DEFAULT_TRANSCRIBER_TIMEOUT_SECONDS = 180;

/** Как часто идёт тик прогона по умолчанию, в секундах. */
export const DEFAULT_TRANSCRIPTION_POLL_SECONDS = 20;

/** Сколько ждём одну расшифровку по умолчанию, в минутах. */
export const DEFAULT_TRANSCRIPTION_MAX_MINUTES = 120;

/**
 * Битрейт извлекаемой дорожки по умолчанию.
 *
 * Компромисс точности и предела отправки, **не измеренный** на живом
 * материале, — поэтому настройка, а не константа: константа означала бы,
 * что мы уже измерили.
 */
export const DEFAULT_AUDIO_BITRATE = '24k';

/** Сколько ждём `ffmpeg` по умолчанию, в минутах. */
export const DEFAULT_EXTRACT_MINUTES = 30;

/** Разобранные настройки расшифровки. Ключ здесь есть, наружу он не выходит. */
export interface TranscriberSettings {
  /** Куда уходит запись: внешний API либо своя служба в контуре. */
  kind: TranscriberKind;
  baseUrl: string;
  apiKey: string;
  /**
   * Чем предъявить ключ.
   *
   * Своей переменной у схемы нет, и это решение: узел настраивается строкой
   * `model_services`, где схема — поле, а запасным источником окружение
   * осталось ровно для шести названных переменных. Умолчание выводится из
   * вида узла: SpeechKit предъявляет ключ словом `Api-Key`, а свой узел в
   * контуре заголовка не требует вовсе.
   */
  authScheme: ModelAuthScheme;
  model: string;
  /** Каталог Yandex либо `null`: уходит заголовком `x-folder-id`. */
  folder: string | null;
  timeoutSeconds: number;
  /** Предел отправки службе, в байтах. */
  maxSendBytes: number;
  /** Предел загрузки, в байтах. Другое число и другой вопрос. */
  maxUploadBytes: number;
  /** Как часто идёт тик прогона; `0` — цикл выключен. */
  pollSeconds: number;
  /** Сколько ждём одну расшифровку, в минутах. */
  maxMinutes: number;
  /**
   * Заявленное значение `CAIRN_RECORDING_FFMPEG`: `auto`, `off` или путь.
   *
   * **Не** разрешается здесь в «доступно или нет»: «есть ли исполняемый
   * файл» — вопрос к файловой системе, и задавать его при каждом вызове
   * значило бы ходить на диск ради того, что за время жизни процесса не
   * меняется. Разрешает фабрика порта, один раз при старте (дизайн, 7.4).
   */
  ffmpeg: string;
  audioBitrate: string;
  /** Сколько ждём `ffmpeg`, в минутах. */
  extractMinutes: number;
  /** Имя узла из адреса: показывается человеку и идёт в журнал. */
  host: string | null;
  /**
   * Выключен ли порт решением человека — `CAIRN_TRANSCRIBER=off`.
   *
   * Отдельно от `isEnabled`: «выключено вами» и «не хватает ключа» чинятся
   * разным действием, и разрешение настройки обязано назвать их разными
   * причинами.
   */
  isOff: boolean;
  isEnabled: boolean;
}

/**
 * Читает настройки расшифровки из окружения.
 *
 * `isEnabled` — не отдельный выключатель, а `off` вместе с полнотой
 * настройки: внешнему нужны адрес, ключ **и** каталог, локальному — адрес.
 * Два обязательных поля у внешнего, а не одно, потому что `x-folder-id` у
 * SpeechKit не опционален: порт, включённый наполовину, отказывал бы на
 * каждом вызове вместо того, чтобы честно показывать выключенную кнопку
 * (дизайн, 7.4).
 */
export function transcriberSettings(): TranscriberSettings {
  const kind = kindOf(process.env[TRANSCRIBER_KIND_ENV]);
  const isOff = (process.env[TRANSCRIBER_KIND_ENV] ?? '').trim().toLowerCase() === TRANSCRIBER_OFF;
  const isExternal = kind === TranscriberKind.External;
  // Умолчание адреса есть только у внешнего: подставить его локальной
  // установке значило бы тихо отправить запись наружу при `local` без
  // адреса — подмена названной границы передачи данных.
  //
  // `nonEmptyOf`, а не `??`: compose передаёт необъявленную переменную
  // пустой строкой, а не отсутствующей (`${VAR:-}`), и пустая строка не
  // nullish. На `??` порт в контейнере оказался бы выключен при вписанном
  // ключе — то есть ровно там, где он настроен.
  const baseUrl = nonEmptyOf(
    process.env[TRANSCRIBER_BASE_URL_ENV],
    isExternal ? TRANSCRIBER_EXTERNAL_BASE_URL : '',
  );
  const apiKey = (process.env[TRANSCRIBER_API_KEY_ENV] ?? '').trim();
  const folder = nullableOf(process.env[TRANSCRIBER_FOLDER_ENV]);

  return {
    kind,
    baseUrl,
    apiKey,
    authScheme: isExternal ? ModelAuthScheme.ApiKey : ModelAuthScheme.None,
    model: nonEmptyOf(process.env[TRANSCRIBER_MODEL_ENV], DEFAULT_TRANSCRIBER_MODEL),
    folder,
    timeoutSeconds: positiveOf(
      process.env[TRANSCRIBER_TIMEOUT_ENV],
      DEFAULT_TRANSCRIBER_TIMEOUT_SECONDS,
    ),
    maxSendBytes: positiveOf(process.env[TRANSCRIBER_MAX_BYTES_ENV], DEFAULT_MAX_SEND_BYTES),
    maxUploadBytes: positiveOf(process.env[RECORDING_MAX_BYTES_ENV], DEFAULT_MAX_UPLOAD_BYTES),
    pollSeconds: nonNegativeOf(
      process.env[TRANSCRIPTION_POLL_ENV],
      DEFAULT_TRANSCRIPTION_POLL_SECONDS,
    ),
    maxMinutes: positiveOf(
      process.env[TRANSCRIPTION_MAX_MINUTES_ENV],
      DEFAULT_TRANSCRIPTION_MAX_MINUTES,
    ),
    ffmpeg: nonEmptyOf(process.env[RECORDING_FFMPEG_ENV], FFMPEG_AUTO),
    audioBitrate: nonEmptyOf(process.env[RECORDING_AUDIO_BITRATE_ENV], DEFAULT_AUDIO_BITRATE),
    extractMinutes: positiveOf(
      process.env[RECORDING_EXTRACT_MINUTES_ENV],
      DEFAULT_EXTRACT_MINUTES,
    ),
    host: hostOf(baseUrl),
    isOff,
    isEnabled:
      !isOff && baseUrl !== '' && (!isExternal || (apiKey !== '' && folder !== null)),
  };
}

/** Куда уходит запись; `off` и мусор дают умолчание — внешний. */
function kindOf(value: string | undefined): TranscriberKind {
  return (value ?? '').trim().toLowerCase() === TranscriberKind.Local
    ? TranscriberKind.Local
    : TranscriberKind.External;
}

/** Положительное число из настройки либо умолчание. */
function positiveOf(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Неотрицательное число из настройки либо умолчание.
 *
 * Отдельно от {@link positiveOf}, потому что `0` у интервала опроса —
 * **законное** значение: цикл выключен, и так работают тесты и локальная
 * разработка. Мусор при этом остаётся умолчанием: ноль — решение, опечатка
 * — не решение, и принять одно за другое значило бы выключить расшифровку
 * молча.
 */
function nonNegativeOf(value: string | undefined, fallback: number): number {
  const trimmed = (value ?? '').trim();

  if (trimmed === '') {
    return fallback;
  }

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Непустая строка из настройки либо умолчание. */
function nonEmptyOf(value: string | undefined, fallback: string): string {
  const trimmed = (value ?? '').trim();

  return trimmed === '' ? fallback : trimmed;
}

/**
 * Непустая строка либо `null`: пустое означает отсутствие.
 *
 * `null`, а не пустая строка, потому что колонка каталога в базе
 * обнуляема, и два написания одного и того же состояния разошлись бы на
 * первом же сравнении источников.
 */
function nullableOf(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();

  return trimmed === '' ? null : trimmed;
}
