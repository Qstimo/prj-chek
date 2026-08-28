/** Результат проверки срока регистрации. */
export interface DomainExpiryResult {
  expiresAt: Date | null;
  error: string | null;
}

/** Функция запроса RDAP; в тестах подменяется подделкой. */
export type RdapFetch = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{ status: number; json: () => Promise<unknown> }>;

/** Предел ожидания ответа реестра. */
const TIMEOUT_MS = 10_000;

/**
 * Узнаёт срок регистрации домена через RDAP (ТЗ 6).
 *
 * `rdap.org` — bootstrap-сервис реестров: он переадресует на реестр
 * нужной зоны. Зоны без RDAP и сетевые ошибки — данные проверки.
 */
export async function checkDomainExpiry(
  domain: string,
  fetchFn: RdapFetch = fetch,
): Promise<DomainExpiryResult> {
  try {
    const response = await fetchFn(`https://rdap.org/domain/${domain}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.status !== 200) {
      return { expiresAt: null, error: `реестр ответил HTTP ${response.status}` };
    }

    const body = (await response.json()) as {
      events?: { eventAction?: string; eventDate?: string }[];
    };

    const expiration = body.events?.find((event) => event.eventAction === 'expiration');

    if (!expiration?.eventDate) {
      return { expiresAt: null, error: 'реестр не сообщил событие expiration' };
    }

    return { expiresAt: new Date(expiration.eventDate), error: null };
  } catch (cause) {
    return {
      expiresAt: null,
      error: cause instanceof Error ? cause.message : 'неизвестная ошибка',
    };
  }
}
