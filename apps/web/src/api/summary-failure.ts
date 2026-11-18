import { ApiError } from './errors';

/** Отказ потока саммари, разобранный по контракту. */
export interface ISummaryFailure {
  /** Код из тела отказа; отсутствует у сетевых и прочих ответов без него. */
  code?: string;
  /** Предел объёма предложителя — только у `summary_text_too_long`. */
  maxChars?: number;
  /**
   * Предел размера в байтах — у отказов по размеру записи.
   *
   * Поле одно на **оба** предела, загрузки и отправки: в теле отказа
   * приходит то число, которым отказали, а код отказа уже говорит, о каком
   * пределе речь. Заводить `maxUploadBytes` и `maxSendBytes` по отдельности
   * значило бы хранить в экране знание, которое и так пришло с сервера.
   */
  maxBytes?: number;
}

/**
 * Достаёт код отказа из ответа сервера.
 *
 * Код, а не разбор текста: фразу в ответе можно переписать, код — нет
 * (`CARRY_OVER_NEEDS_LABEL` заведён по той же причине). Предел объёма
 * берётся оттуда же, потому что он настройка узла: подставить своё число
 * значило бы соврать о чужой настройке.
 *
 * Кода нет — поле пустое, и экран говорит общими словами: подменять
 * сетевой сбой кодом порта значило бы объяснить не то, что случилось.
 *
 * Живёт в `api/`, а не рядом с хуками, намеренно: экраны подменяют
 * `@/api/hooks` целиком в тестах, и чистая функция оттуда возвращала бы
 * `undefined` вместе с хуками.
 */
export function summaryFailureOf(error: unknown): ISummaryFailure {
  if (!(error instanceof ApiError)) {
    return {};
  }

  const details = error.details as
    | { code?: unknown; maxChars?: unknown; maxBytes?: unknown }
    | null;
  const code = typeof details?.code === 'string' ? details.code : undefined;
  const maxChars = typeof details?.maxChars === 'number' ? details.maxChars : undefined;
  const maxBytes = typeof details?.maxBytes === 'number' ? details.maxBytes : undefined;

  return {
    ...(code === undefined ? {} : { code }),
    ...(maxChars === undefined ? {} : { maxChars }),
    ...(maxBytes === undefined ? {} : { maxBytes }),
  };
}
