import { z } from 'zod';

import {
  ModelAuthScheme,
  ModelProbeOutcome,
  ModelServiceKind,
  ModelServicePlacement,
  ModelServiceSource,
} from '../enums';

/** Адрес негоден: схема, строка запроса или данные входа в адресе. */
export const MODEL_SERVICE_BAD_URL = 'model_service_bad_url';
/** Внешний узел по `http`: ключ уйдёт по открытому каналу. */
export const MODEL_SERVICE_INSECURE_URL = 'model_service_insecure_url';
/** Проверка связи невозможна: узел не настроен. */
export const MODEL_SERVICE_NOT_CONFIGURED = 'model_service_not_configured';

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

/**
 * Адрес службы: `http`/`https`, без строки запроса и без `userinfo`.
 *
 * Схема держит только длину и непустоту: остальное проверяет
 * {@link parseModelServiceBaseUrl}, у которой есть различимые коды
 * отказа, — у `400` от zod кода, который интерфейс сумел бы объяснить,
 * нет.
 */
export const modelServiceBaseUrlSchema = z.string().trim().min(1).max(500);

/**
 * Запись настройки узла целиком.
 *
 * `.strict()` не украшение: пресеты провайдеров не хранятся (дизайн,
 * 10.1), и поле `preset`, посланное формой, обязано получить отказ, а не
 * быть молча отброшенным.
 */
export const modelServiceUpdateSchema = z
  .object({
    baseUrl: modelServiceBaseUrlSchema,
    authScheme: z.nativeEnum(ModelAuthScheme),
    model: z.string().trim().min(1).max(200),
    folder: z.string().trim().max(200).nullable(),
    placement: z.nativeEnum(ModelServicePlacement),
    timeoutSeconds: z.number().int().positive().max(600),
    isEnabled: z.boolean(),
    /**
     * Ключ: **поле отсутствует** — не менять, `null` — убрать, строка —
     * поставить.
     *
     * Пустая строка отвергается схемой намеренно: иначе «убрать ключ» и
     * «форма отправила незаполненное поле» были бы одним и тем же, и
     * открыть форму, ничего не трогая, и сохранить значило бы стереть
     * ключ.
     */
    secret: z.string().min(1).max(500).nullable().optional(),
  })
  .strict();

/**
 * Действующая настройка узла. Ключа здесь нет никогда.
 *
 * Собирается полем за полем, а не расширением строки базы: ключ не выходит
 * ни в один ответ, и единственный способ это удержать — явная проекция
 * (дизайн, 3.5).
 */
export const modelServiceSettingsSchema = z.object({
  kind: z.nativeEnum(ModelServiceKind),
  /** Откуда взята действующая настройка: главный ответ экрана. */
  source: z.nativeEnum(ModelServiceSource),
  /** Полный адрес: суперадмин его и вписал, править иначе нечего. */
  baseUrl: z.string(),
  /** Имя узла из адреса. Показывается и не-суперадмину. */
  host: z.string().nullable(),
  authScheme: z.nativeEnum(ModelAuthScheme),
  model: z.string(),
  folder: z.string().nullable(),
  placement: z.nativeEnum(ModelServicePlacement),
  timeoutSeconds: z.number().int().positive(),
  /**
   * Ключ задан — и всё, что о нём сообщается.
   *
   * Ни длины, ни хвоста: хвост сужает перебор и не отвечает ни на один
   * вопрос, на который не отвечает «задан» (дизайн, 3.4).
   */
  hasSecret: z.boolean(),
  /** Решение человека «включено»; действующая включённость — ниже. */
  isEnabled: z.boolean(),
  /** `is_enabled` и полнота настройки вместе: по нему судит интерфейс. */
  isOperational: z.boolean(),
  /**
   * Почему узел не работает: `secret_missing`, `base_url_missing`,
   * `secret_undecryptable`, `disabled`. Пусто — работает.
   *
   * Код, а не фраза, по образцу `CARRY_OVER_NEEDS_LABEL`: код интерфейс
   * разбирает, фразу можно переписать.
   */
  blockedBy: z.string().nullable(),
  /** Имена переменных окружения этого узла — для обеих подсказок 2.2. */
  envVarNames: z.array(z.string()),
  /** Объявлены ли они на этой установке: источник «не действуют». */
  hasEnvironmentSettings: z.boolean(),
  updatedAt: z.string().nullable(),
  updatedByLabel: z.string().nullable(),
});

/** Исход живого вызова службы. Тела чужого ответа здесь нет никогда. */
export const modelProbeResultSchema = z.object({
  outcome: z.nativeEnum(ModelProbeOutcome),
  /** Код HTTP, если он был. Число — не утечка, тело — утечка (дизайн, 8.3). */
  status: z.number().int().nullable(),
  host: z.string().nullable(),
  model: z.string(),
  durationMs: z.number().int().nonnegative(),
});

/** Тип данных контракта служб модели. */
export type ModelServiceUpdate = z.infer<typeof modelServiceUpdateSchema>;

/** Тип данных контракта служб модели. */
export type ModelServiceSettings = z.infer<typeof modelServiceSettingsSchema>;

/** Тип данных контракта служб модели. */
export type ModelProbeResult = z.infer<typeof modelProbeResultSchema>;
