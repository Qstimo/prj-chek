import {
  MODEL_SERVICE_BAD_URL,
  MODEL_SERVICE_INSECURE_URL,
  ModelAuthScheme,
  ModelServicePlacement,
} from '@cairn/shared';

import type { Preset } from './types';

/**
 * Заготовки провайдеров — **снимок на 2026-11-17**, и они не хранятся.
 *
 * Пресет заполняет два поля (адрес и схему) и меняет подсказку у модели;
 * дальше это обычные поля. Колонки «провайдер» в базе нет, и код по имени
 * провайдера не ветвится: иначе устаревшая заготовка стала бы
 * неисправимой правкой полей — ветвление сидело бы в коде и перебило их
 * (дизайн, 10.2).
 *
 * **Имя модели не подставляется ни в одном пресете.** Перечень моделей у
 * провайдера меняется быстрее, чем выходит наш код, и подставленное имя
 * выглядело бы настроенным, а отвечало бы `400`. Пустое поле с подсказкой
 * формы отправляет человека в каталог моделей провайдера — туда, где
 * правда.
 *
 * Источники: ProxyAPI — `proxyapi.ru/docs`, страница «OpenAI-совместимый
 * API» (адрес и `Bearer` подтверждены целиком). Yandex — адрес известен
 * только по третьим источникам: документация в ноябре 2026 переехала с
 * `yandex.cloud/docs/foundation-models` на `aistudio.yandex.ru/docs`, и
 * страница совместимости отвечает `404`. Поэтому у него стоит
 * `isUnverified`, и форма говорит об этом словами: заготовка, которая
 * врёт о чужом API, хуже пустого поля.
 */
export const PRESETS: Preset[] = [
  {
    value: 'proxyapi',
    label: 'ProxyAPI',
    baseUrl: 'https://api.proxyapi.ru/v1',
    authScheme: ModelAuthScheme.Bearer,
    modelHint:
      'Имя из каталога моделей ProxyAPI, например anthropic/claude-haiku-4-5. Вендор задаётся префиксом имени.',
  },
  {
    value: 'yandex',
    label: 'Yandex AI Studio',
    baseUrl: 'https://llm.api.cloud.yandex.net/v1',
    authScheme: ModelAuthScheme.ApiKey,
    modelHint: 'Полное имя вида gpt://<каталог>/yandexgpt/latest.',
    isUnverified: true,
  },
  {
    value: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    authScheme: ModelAuthScheme.Bearer,
    modelHint: 'Например gpt-4o-mini.',
  },
  {
    value: 'custom',
    label: 'Свой узел в контуре',
    // Пусто намеренно: подставить внешний адрес локальной установке
    // значило бы тихо отправить текст наружу (дизайн, 10.3).
    baseUrl: '',
    authScheme: ModelAuthScheme.None,
    modelHint: 'Как называет модель ваш endpoint.',
  },
];

/** Адрес, который сам провайдер пока не подтвердил, назван прямо. */
export const UNVERIFIED_PRESET_NOTE =
  'Адрес этого пресета требует проверки: документация провайдера переехала, и значение известно по третьим источникам. Проверьте его кнопкой «Проверить связь».';

/**
 * Отказы разбора адреса по-русски.
 *
 * Чистая функция контракта возвращает код, а фразу собирает интерфейс —
 * тот же приём, что у отказов разбивки: код разбирается, фразу можно
 * переписать.
 */
export const URL_ERROR_MESSAGES: Record<string, string> = {
  [MODEL_SERVICE_BAD_URL]:
    'Адрес негоден: нужен http или https, без строки запроса и без данных входа вида user:pass@.',
  [MODEL_SERVICE_INSECURE_URL]:
    'Внешний узел по http: ключ уйдёт по открытому каналу. Возьмите https или укажите вид «Узел в вашем контуре».',
};

/** Схемы авторизации в выборе: значение заголовка, а не перевод. */
export const AUTH_SCHEME_OPTIONS: { value: ModelAuthScheme; label: string }[] = [
  { value: ModelAuthScheme.Bearer, label: 'Bearer' },
  { value: ModelAuthScheme.ApiKey, label: 'Api-Key' },
  { value: ModelAuthScheme.None, label: 'Без ключа' },
];

/** Вид узла: его знает только человек. */
export const PLACEMENT_OPTIONS: { value: ModelServicePlacement; label: string }[] = [
  { value: ModelServicePlacement.External, label: 'Внешний узел' },
  { value: ModelServicePlacement.Local, label: 'Узел в вашем контуре' },
];

/** Подпись у поля каталога — честная, как велит дизайн (6.3). */
export const FOLDER_HINT =
  'Каталог нужен службам Yandex; OpenAI-совместимому узлу Yandex каталог задаётся внутри имени модели (gpt://<каталог>/…).';
