import { TaskSuggesterKind } from '@cairn/shared';

/**
 * Настройки предложителя задач (дизайн, раздел 5.3).
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
/** Ключ API. Пусто при `external` означает «порт выключен». */
export const SUGGESTER_API_KEY_ENV = 'CAIRN_TASK_SUGGESTER_API_KEY';
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

/** Адрес внешнего API по умолчанию. У `local` умолчания адреса нет. */
export const EXTERNAL_BASE_URL = 'https://api.openai.com/v1';

/** Модель по умолчанию. */
export const DEFAULT_SUGGESTER_MODEL = 'gpt-4o-mini';

/** Предел ожидания ответа по умолчанию, в секундах. */
export const DEFAULT_SUGGESTER_TIMEOUT_SECONDS = 60;

/** Предел объёма текста по умолчанию, в знаках. */
export const DEFAULT_SUGGESTER_MAX_CHARS = 40_000;

/** Сколько задач принимаем от модели по умолчанию. */
export const DEFAULT_SUGGESTER_MAX_TASKS = 50;

/** Разобранные настройки порта. Ключ здесь есть, наружу он не выходит. */
export interface SuggesterSettings {
  kind: TaskSuggesterKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutSeconds: number;
  maxChars: number;
  maxTasks: number;
  /** Имя узла из адреса: показывается человеку и идёт в журнал. */
  host: string | null;
  isEnabled: boolean;
}

/**
 * Читает настройки порта из окружения.
 *
 * `isEnabled` — не отдельный выключатель, а следствие полноты настройки:
 * `off` выключает порт целиком, внешнему адаптеру нужен ключ, локальному —
 * адрес. На свежей установке ключа нет, и текст наружу не уходит до того,
 * как суперадмин впишет его в `.env`.
 */
export function suggesterSettings(): SuggesterSettings {
  const kind = kindOf(process.env[SUGGESTER_KIND_ENV]);
  const isOff = (process.env[SUGGESTER_KIND_ENV] ?? '').trim().toLowerCase() === SUGGESTER_OFF;
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
    kind === TaskSuggesterKind.External ? EXTERNAL_BASE_URL : '',
  );
  const apiKey = (process.env[SUGGESTER_API_KEY_ENV] ?? '').trim();
  const needsKey = kind === TaskSuggesterKind.External;

  return {
    kind,
    baseUrl,
    apiKey,
    model: nonEmptyOf(process.env[SUGGESTER_MODEL_ENV], DEFAULT_SUGGESTER_MODEL),
    timeoutSeconds: positiveOf(
      process.env[SUGGESTER_TIMEOUT_ENV],
      DEFAULT_SUGGESTER_TIMEOUT_SECONDS,
    ),
    maxChars: positiveOf(process.env[SUGGESTER_MAX_CHARS_ENV], DEFAULT_SUGGESTER_MAX_CHARS),
    maxTasks: positiveOf(process.env[SUGGESTER_MAX_TASKS_ENV], DEFAULT_SUGGESTER_MAX_TASKS),
    host: hostOf(baseUrl),
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

/** Вид адаптера; `off` и мусор дают умолчание — внешний. */
function kindOf(value: string | undefined): TaskSuggesterKind {
  return (value ?? '').trim().toLowerCase() === TaskSuggesterKind.Local
    ? TaskSuggesterKind.Local
    : TaskSuggesterKind.External;
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
