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
 * Живым считается ответ до 400: редирект — признак работающего сервера.
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
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  const answered = (status: number): HealthResult => ({
    health: status < 400 ? HealthState.Up : HealthState.Down,
    latencyMs: Date.now() - startedAt,
    error: status < 400 ? null : `HTTP ${status}`,
  });

  let secureFailure: string;

  try {
    // Ответ сервера — любой — и есть результат: перепроверять нечего.
    return answered((await request('https')).status);
  } catch (cause) {
    secureFailure = cause instanceof Error ? cause.message : 'неизвестная ошибка';
  }

  try {
    // Стенд без сертификата отвечает по http — звать его мёртвым неверно.
    return answered((await request('http')).status);
  } catch {
    // Спрашивали https — о нём и отвечаем: отказ http нового не добавляет.
    return { health: HealthState.Down, latencyMs: Date.now() - startedAt, error: secureFailure };
  }
}
