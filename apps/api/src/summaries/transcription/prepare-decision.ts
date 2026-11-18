import { RECORDING_NEEDS_FFMPEG, SERVICE_AUDIO_TYPES } from '@cairn/shared';

/** Единственный контейнер службы, у которого содержимое ещё спрашивается. */
const OGG_TYPE = 'audio/ogg';

/** Что сделать с загруженной записью, прежде чем отдавать её службе. */
export enum PrepareAction {
  /** Отдать как есть: загруженный файл и есть дорожка. */
  Pass = 'pass',
  /** Привести к пригодному виду через `ffmpeg`. */
  Convert = 'convert',
  /** Отказать названным кодом: эта установка такого не умеет. */
  Reject = 'reject',
}

/** Что известно о записи к моменту решения. */
export interface PrepareDecisionInput {
  /** Контейнер из широкого списка: его уже приняла схема контракта. */
  uploadType: string;
  uploadBytes: number;
  /**
   * `OGG` с потоком Opus внутри.
   *
   * Читается из подписи при приёме. Проверка живёт здесь, а не на
   * загрузке: `OGG/Vorbis` службе отдать нельзя, но перекодировать —
   * можно, и отвергать его на входе значило бы отказывать там, где есть
   * работа (дизайн, 4.1 и 7.6).
   */
  isOpus: boolean;
  /** Предел отправки службе: больше этого она не возьмёт. */
  maxSendBytes: number;
  /** Есть ли на этой установке `ffmpeg`. */
  canExtract: boolean;
}

/** Решение: действие и, у отказа, его код. */
export interface PrepareDecision {
  action: PrepareAction;
  code?: string;
}

/**
 * Извлекать дорожку, отдавать запись как есть или отказать.
 *
 * Шаг честнее называть **приведением к пригодному виду**, а не только
 * извлечением: у него два повода сработать — чужой контейнер и чрезмерный
 * размер, — и одно действие. Часовой `mp3` в 320 кбит/с стерео это 144 МБ,
 * мимо и нашего предела отправки, и провайдерского предела тела; отказать
 * ему, принимая при этом `mp4` на полгигабайта, было бы абсурдом —
 * механизм один и тот же, и работает он для обоих (дизайн, 7.6).
 *
 * Порядок ветвей назван дизайном и не является оптимизацией: `Pass`
 * первой, потому что прогонять готовый `mp3` через перекодирование — это и
 * минуты впустую, и потеря качества на ровном месте (сжатое в сжатое
 * всегда хуже исходника).
 *
 * Отказ отдельным кодом, а не общим «формат не принимается»: формат сам по
 * себе законен, негодна **установка**, — поэтому `409`, а не `415`
 * (дизайн, 5.3).
 */
export function prepareDecision(input: PrepareDecisionInput): PrepareDecision {
  if (isServiceReady(input)) {
    return { action: PrepareAction.Pass };
  }

  if (input.canExtract) {
    return { action: PrepareAction.Convert };
  }

  return { action: PrepareAction.Reject, code: RECORDING_NEEDS_FFMPEG };
}

/**
 * Служба возьмёт эту запись как есть.
 *
 * Три условия, и каждое — своё: контейнер из списка службы, внутри `OGG`
 * именно Opus, и размер **не больше** предела отправки. Граница
 * включительная: предел — это «не больше», а не «меньше».
 */
function isServiceReady(input: PrepareDecisionInput): boolean {
  const isServiceType = (SERVICE_AUDIO_TYPES as readonly string[]).includes(input.uploadType);
  const isContentReady = input.uploadType !== OGG_TYPE || input.isOpus;

  return isServiceType && isContentReady && input.uploadBytes <= input.maxSendBytes;
}
