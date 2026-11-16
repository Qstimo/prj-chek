import { HealthState, StatusCheckCode } from '@cairn/shared';

import { failureOf, httpFailureOf, isMisconfigured } from './failure';
import { timeoutMsOf } from './settings';

/** Результат health-проверки. */
export interface HealthResult {
  health: HealthState;
  latencyMs: number;
  /** Что увидели: `null` — чистый `2xx`, говорить не о чем. */
  code: StatusCheckCode | null;
  /** Фраза для человека; у живого адреса обычно `null`. */
  error: string | null;
  /** Куда ведёт перенаправление, если оно было. */
  redirectTo: string | null;
}

/** Ответ, каким его видит проверка: код и заголовки. */
export interface HealthResponse {
  status: number;
  headers: { get: (name: string) => string | null };
}

/** Функция запроса; в тестах подменяется подделкой. */
export type HealthFetch = (
  url: string,
  init: { redirect: 'manual'; signal: AbortSignal },
) => Promise<HealthResponse>;

/** Настройка предела ожидания ответа. */
export const HEALTH_TIMEOUT_ENV = 'CAIRN_HEALTH_CHECK_TIMEOUT_SECONDS';

/** Собирает адрес проверки: пустой путь означает корень. */
function urlOf(scheme: 'https' | 'http', address: string, path: string | null): string {
  return `${scheme}://${address}${path ?? '/'}`;
}

/**
 * Проверяет доступность адреса окружения (ТЗ 6).
 *
 * Адрес и путь принимаются порознь, а URL собирается здесь: иначе правило
 * «https с откатом на http» разошлось бы по двум местам.
 *
 * Не бросает исключений: недоступность — данные проверки, а не авария.
 *
 * Трактовка ответа (раздел 3 дизайна). Падение — только `5xx` и отказ
 * соединения: правило «меньше 400 — жив, иначе мёртв» объявляло падением
 * адрес за авторизацией и адрес, не принимающий `GET`, и будило человека
 * пушем каждые четверть часа. `4xx` говорит о том, как настроена
 * проверка, а не о том, что сервер лежит, — и до человека он доходит
 * предупреждением, а не аварией.
 */
export async function checkHealth(
  address: string,
  path: string | null,
  fetchFn: HealthFetch = fetch,
): Promise<HealthResult> {
  // Задержку меряем от первой попытки: человеку важно, сколько ждал он.
  const startedAt = Date.now();

  const request = async (scheme: 'https' | 'http') =>
    fetchFn(urlOf(scheme, address, path), {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMsOf(process.env[HEALTH_TIMEOUT_ENV])),
    });

  const answered = (response: HealthResponse): HealthResult => ({
    ...observationOf(response),
    latencyMs: Date.now() - startedAt,
  });

  let secureFailure: HealthResult;

  try {
    // Ответ сервера — любой — и есть результат: перепроверять нечего.
    return answered(await request('https'));
  } catch (cause) {
    const failure = failureOf(cause);

    secureFailure = {
      health: HealthState.Down,
      latencyMs: Date.now() - startedAt,
      code: failure.code,
      error: failure.phrase,
      redirectTo: null,
    };
  }

  try {
    // Стенд без сертификата отвечает по http — звать его мёртвым неверно.
    return answered(await request('http'));
  } catch {
    // Спрашивали https — о нём и отвечаем: отказ http нового не добавляет.
    return { ...secureFailure, latencyMs: Date.now() - startedAt };
  }
}

/**
 * Что сказал ответ: жив ли адрес, какой это случай и куда он ведёт.
 *
 * Перенаправление — отдельный случай, а не «код меньше 400»: в браузере
 * `redirect: 'manual'` даёт непрозрачный ответ со `status === 0`, и прежнее
 * правило читало его как живой по случайности. В Node (проверено
 * настоящим `fetch`) приходит сам ответ — код и `Location`, — поэтому цель
 * записывается: 302 на чужое имя у одних рабочая настройка, у других
 * угнанная запись.
 */
function observationOf(response: HealthResponse): Omit<HealthResult, 'latencyMs'> {
  const { status } = response;

  if (status === 0 || (status >= 300 && status < 400)) {
    return {
      health: HealthState.Up,
      code: StatusCheckCode.Redirect,
      error: null,
      // Непрозрачный ответ заголовков не несёт — и это не ошибка, а предел
      // того, что о нём известно.
      redirectTo: response.headers.get('location'),
    };
  }

  if (status < 300) {
    return { health: HealthState.Up, code: null, error: null, redirectTo: null };
  }

  const failure = httpFailureOf(status);

  return {
    health: failure.isDown ? HealthState.Down : HealthState.Up,
    code: failure.code,
    // Пометка «закрыто авторизацией» — не ошибка адреса: фразу несут
    // только падение и неверно настроенная ручка.
    error: failure.isDown || isMisconfigured(failure.code) ? failure.phrase : null,
    redirectTo: null,
  };
}
