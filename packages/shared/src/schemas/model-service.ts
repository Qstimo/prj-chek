import { ModelServicePlacement } from '../enums';

/** Адрес негоден: схема, строка запроса или данные входа в адресе. */
export const MODEL_SERVICE_BAD_URL = 'model_service_bad_url';
/** Внешний узел по `http`: ключ уйдёт по открытому каналу. */
export const MODEL_SERVICE_INSECURE_URL = 'model_service_insecure_url';

/** Разобранный адрес службы: что писать в базу и что показывать человеку. */
export interface ParsedModelServiceUrl {
  /** Адрес без замыкающей косой черты: к нему адаптер дописывает путь. */
  baseUrl: string;
  /** Имя узла: идёт на экран и в журнал, полный адрес — никуда. */
  host: string;
}

/**
 * Разбирает и проверяет адрес службы модели.
 *
 * Чистая функция контракта, общая с браузером (как `normalizeSummaryText`):
 * форма отказывает до отправки и теми же словами, что сервер. Бросает
 * обычную `Error` с кодом в сообщении — о HTTP она не знает, код в тело
 * ответа переносит сервер.
 *
 * Запрет на строку запроса и на `user:pass@` — не вкус, а инвариант:
 * ровно так ключ оказывается в адресе у части провайдеров, и, попав туда,
 * он уехал бы и в экранную подпись, и в журнал, и в текст отказа.
 * Запретить его там дешевле, чем вычищать его из четырёх проекций
 * (дизайн, 3.5).
 *
 * `http` у внешнего узла — **отказ**, а не предупреждение: ключ в
 * открытом канале к чужому узлу. У узла в контуре `http` допускается:
 * `http://llm.internal:8000` — обычный способ держать модель у себя, и
 * запрещать его значило бы запретить ровно тот путь, который закрывает
 * утечку целиком (дизайн, 4.2).
 */
export function parseModelServiceBaseUrl(
  raw: string,
  placement: ModelServicePlacement,
): ParsedModelServiceUrl {
  let url: URL;

  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(MODEL_SERVICE_BAD_URL);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(MODEL_SERVICE_BAD_URL);
  }

  if (url.search !== '' || url.hash !== '' || url.username !== '' || url.password !== '') {
    throw new Error(MODEL_SERVICE_BAD_URL);
  }

  if (url.protocol === 'http:' && placement === ModelServicePlacement.External) {
    throw new Error(MODEL_SERVICE_INSECURE_URL);
  }

  // Собирается из разобранных частей, а не из присланной строки: иначе
  // сюда попало бы всё, что `URL` разобрал, но мы не проверяли.
  // Замыкающие косые снимаются, потому что адаптер дописывает
  // `/chat/completions`, и двойная косая в пути дала бы `404`.
  return {
    baseUrl: `${url.origin}${url.pathname}`.replace(/\/+$/, ''),
    host: url.hostname,
  };
}
