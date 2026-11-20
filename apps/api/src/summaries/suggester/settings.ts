import {
  MAX_CHRONICLE_CONTENT_CHARS,
  ModelAuthScheme,
  ModelServicePlacement,
} from '@cairn/shared';

/**
 * Настройки предложителя задач (дизайн, раздел 5.3).
 *
 * Окружение — **запасной** источник настройки узла: оно действует, пока
 * в `model_services` нет строки этого узла (дизайн, 2.1). Поэтому разбор
 * здесь ничего не знает ни о базе, ни о старшинстве — решает это одна
 * `ModelServiceSettingsService`, и доливать отсюда недостающие поля
 * записи запрещено.
 *
 * Значения читаются при каждом вызове, а не при загрузке модуля: иначе
 * настройка зависела бы от порядка импортов, а тесты не могли бы её
 * менять. Тот же приём, что в `status/checkers/settings.ts`.
 *
 * Мусор и неположительное означают умолчание, а не «ждать вечно» и не
 * «принимать без предела»: порт уходит в сеть и стоит денег.
 */

/** Вид адаптера: куда уходит текст. */
export const SUGGESTER_KIND_ENV = 'CAIRN_TASK_SUGGESTER';
/** Адрес OpenAI-совместимого API. */
export const SUGGESTER_BASE_URL_ENV = 'CAIRN_TASK_SUGGESTER_BASE_URL';
/** Ключ API. Пусто при схеме не-`none` означает «порт выключен». */
export const SUGGESTER_API_KEY_ENV = 'CAIRN_TASK_SUGGESTER_API_KEY';
/** Как предъявить ключ. Умолчание — `bearer`: так устроены OpenAI и ProxyAPI. */
export const SUGGESTER_AUTH_SCHEME_ENV = 'CAIRN_TASK_SUGGESTER_AUTH_SCHEME';
/** Каталог: нужен службам Yandex. OpenAI-совместимый адаптер его не читает. */
export const SUGGESTER_FOLDER_ENV = 'CAIRN_TASK_SUGGESTER_FOLDER';
/** Модель: настройкой, а не кодом. */
export const SUGGESTER_MODEL_ENV = 'CAIRN_TASK_SUGGESTER_MODEL';
/** Предел ожидания ответа. */
export const SUGGESTER_TIMEOUT_ENV = 'CAIRN_TASK_SUGGESTER_TIMEOUT_SECONDS';
/** Предел объёма текста, уходящего наружу. */
export const SUGGESTER_MAX_CHARS_ENV = 'CAIRN_TASK_SUGGESTER_MAX_CHARS';
/** Сколько задач принимаем от модели. */
export const SUGGESTER_MAX_TASKS_ENV = 'CAIRN_TASK_SUGGESTER_MAX_TASKS';

/** Выключатель порта целиком: третье значение вида. */
export const SUGGESTER_OFF = 'off';

/**
 * Переменные, задающие **узел**, — в порядке полей формы.
 *
 * На экран они не выходят ни одним полем: действующий источник называет
 * бирка, а список из семи имён отвечал на тот же вопрос повторно (дизайн
 * 2026-11-19, 5.3). Список остаётся затем, чтобы проверки могли снять
 * настройку узла целиком одним обходом. Пределов потока (`MAX_CHARS`,
 * `MAX_TASKS`) в нём нет намеренно: они описывают поведение нашего
 * потока, а не свойство узла (дизайн, 7.1).
 */
export const SUGGESTER_NODE_ENV_NAMES = [
  SUGGESTER_KIND_ENV,
  SUGGESTER_BASE_URL_ENV,
  SUGGESTER_AUTH_SCHEME_ENV,
  SUGGESTER_API_KEY_ENV,
  SUGGESTER_MODEL_ENV,
  SUGGESTER_FOLDER_ENV,
  SUGGESTER_TIMEOUT_ENV,
];

/** Адрес внешнего API по умолчанию. У `local` умолчания адреса нет. */
export const EXTERNAL_BASE_URL = 'https://api.openai.com/v1';

/** Модель по умолчанию. */
export const DEFAULT_SUGGESTER_MODEL = 'gpt-4o-mini';

/** Предел ожидания ответа по умолчанию, в секундах. */
export const DEFAULT_SUGGESTER_TIMEOUT_SECONDS = 60;

/**
 * Предел объёма текста по умолчанию, в знаках.
 *
 * Прежние 40 000 **подняты** до предела самого текста саммари: предел
 * разбивки ниже предела текста означал, что принятое саммари разбить
 * нельзя, — человек получал отказ на том, для чего поток и сделан.
 * Четверть миллиона знаков — это около 65 тысяч токенов, то есть треть
 * окна у нынешних моделей.
 *
 * Остаётся настройкой, и это важно: за длинный запрос платит владелец
 * установки, а узкое окно у модели — его обстоятельство, не наше. Узлу с
 * маленьким окном число уменьшают переменной, и отказ тогда называет
 * **его** число, а не наше.
 */
export const DEFAULT_SUGGESTER_MAX_CHARS = MAX_CHRONICLE_CONTENT_CHARS;

/** Сколько задач принимаем от модели по умолчанию. */
export const DEFAULT_SUGGESTER_MAX_TASKS = 50;

/** Разобранные настройки порта. Ключ здесь есть, наружу он не выходит. */
export interface SuggesterSettings {
  placement: ModelServicePlacement;
  baseUrl: string;
  apiKey: string;
  /** Чем предъявить ключ: `none` означает «узел ключа не требует». */
  authScheme: ModelAuthScheme;
  model: string;
  /** Каталог Yandex либо `null`. Этот адаптер его не читает (дизайн, 6.3). */
  folder: string | null;
  timeoutSeconds: number;
  maxChars: number;
  maxTasks: number;
  /** Имя узла из адреса: показывается человеку и идёт в журнал. */
  host: string | null;
  /**
   * Выключен ли порт решением человека — `CAIRN_TASK_SUGGESTER=off`.
   *
   * Отдельно от `isEnabled`, потому что «выключено вами» и «не хватает
   * ключа» чинятся разным действием, и разрешение настройки обязано
   * назвать их разными причинами (дизайн, 4.1).
   */
  isOff: boolean;
  isEnabled: boolean;
}

/**
 * Читает настройки порта из окружения.
 *
 * `isEnabled` — не отдельный выключатель, а `off` вместе с полнотой
 * настройки: нужен адрес, а ключ нужен тогда, когда схема авторизации не
 * `none`. Прежде ключ требовался по виду узла (`external`), и это значило,
 * что «узел без ключа» и «забыли вписать ключ» в коде не различались
 * (дизайн, 6.2). На свежей установке ключа нет, и текст наружу не уходит
 * до того, как суперадмин впишет его в `.env` или на экране.
 */
export function suggesterSettings(): SuggesterSettings {
  const placement = placementOf(process.env[SUGGESTER_KIND_ENV]);
  const isOff = (process.env[SUGGESTER_KIND_ENV] ?? '').trim().toLowerCase() === SUGGESTER_OFF;
  const authScheme = authSchemeOf(process.env[SUGGESTER_AUTH_SCHEME_ENV]);
  // Умолчание адреса есть только у внешнего адаптера: подставить его
  // локальному значило бы тихо отправить текст наружу при `local` без
  // адреса — подмена названной границы передачи данных.
  //
  // `nonEmptyOf`, а не `??`: compose передаёт необъявленную переменную
  // пустой строкой, а не отсутствующей (`${VAR:-}` в `api.environment`),
  // и пустая строка не nullish. На `??` порт в контейнере оказался бы
  // выключен при вписанном ключе — то есть ровно там, где он настроен.
  const baseUrl = nonEmptyOf(
    process.env[SUGGESTER_BASE_URL_ENV],
    placement === ModelServicePlacement.External ? EXTERNAL_BASE_URL : '',
  );
  const apiKey = (process.env[SUGGESTER_API_KEY_ENV] ?? '').trim();
  // Ключ нужен схеме, а не виду узла: узел в контуре без ключа объявляет
  // `none` и этим отличается от узла, которому ключ забыли вписать.
  const needsKey = authScheme !== ModelAuthScheme.None;

  return {
    placement,
    baseUrl,
    apiKey,
    authScheme,
    model: nonEmptyOf(process.env[SUGGESTER_MODEL_ENV], DEFAULT_SUGGESTER_MODEL),
    folder: nullableOf(process.env[SUGGESTER_FOLDER_ENV]),
    timeoutSeconds: positiveOf(
      process.env[SUGGESTER_TIMEOUT_ENV],
      DEFAULT_SUGGESTER_TIMEOUT_SECONDS,
    ),
    maxChars: positiveOf(process.env[SUGGESTER_MAX_CHARS_ENV], DEFAULT_SUGGESTER_MAX_CHARS),
    maxTasks: positiveOf(process.env[SUGGESTER_MAX_TASKS_ENV], DEFAULT_SUGGESTER_MAX_TASKS),
    host: hostOf(baseUrl),
    isOff,
    isEnabled: !isOff && baseUrl !== '' && (!needsKey || apiKey !== ''),
  };
}

/**
 * Имя узла из адреса без пути, порта и ключа.
 *
 * Показывается человеку над кнопкой и попадает в журнал; полный адрес —
 * никуда: в нём бывает и ключ в строке запроса.
 */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    // Негодный адрес — не авария: порт при нём всё равно выключается
    // настройкой, а имя узла честнее не называть вовсе.
    return null;
  }
}

/** Где стоит узел; `off` и мусор дают умолчание — внешний. */
function placementOf(value: string | undefined): ModelServicePlacement {
  return (value ?? '').trim().toLowerCase() === ModelServicePlacement.Local
    ? ModelServicePlacement.Local
    : ModelServicePlacement.External;
}

/**
 * Схема авторизации из настройки; мусор даёт умолчание — `bearer`.
 *
 * Мусор не отказ по тому же правилу, что у чисел: опечатка в `.env` не
 * должна выключать порт молча, а `bearer` — то, чем работают оба
 * подтверждённых внешних провайдера.
 */
function authSchemeOf(value: string | undefined): ModelAuthScheme {
  const normalized = (value ?? '').trim().toLowerCase();
  const known = Object.values(ModelAuthScheme).find((scheme) => scheme === normalized);

  return known ?? ModelAuthScheme.Bearer;
}

/** Положительное число из настройки либо умолчание. */
function positiveOf(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
