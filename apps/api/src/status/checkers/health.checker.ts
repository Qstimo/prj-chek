import { HealthState } from '@cairn/shared';

/** Результат health-проверки. */
export interface HealthResult {
  health: HealthState;
  latencyMs: number;
  error: string | null;
}

/** Функция запроса; в тестах подменяется подделкой. */
export type HealthFetch = (
  url: string,
  init: { redirect: 'manual'; signal: AbortSignal },
) => Promise<{ status: number }>;

/** Предел ожидания ответа. */
const TIMEOUT_MS = 10_000;

/**
 * Проверяет доступность health-check адреса (ТЗ 6).
 *
 * Не бросает исключений: недоступность — данные проверки, а не авария.
 * Живым считается ответ до 400: редирект — признак работающего сервера.
 */
export async function checkHealth(
  url: string,
  fetchFn: HealthFetch = fetch,
): Promise<HealthResult> {
  const startedAt = Date.now();

  try {
    const response = await fetchFn(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const latencyMs = Date.now() - startedAt;

    if (response.status < 400) {
      return { health: HealthState.Up, latencyMs, error: null };
    }

    return { health: HealthState.Down, latencyMs, error: `HTTP ${response.status}` };
  } catch (cause) {
    return {
      health: HealthState.Down,
      latencyMs: Date.now() - startedAt,
      error: cause instanceof Error ? cause.message : 'неизвестная ошибка',
    };
  }
}
