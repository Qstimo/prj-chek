import { Resolver } from 'node:dns/promises';

/** Результат разрешения имени. */
export interface ResolveResult {
  ip: string | null;
  error: string | null;
}

/** Разрешение имени в список адресов; в тестах подменяется подделкой. */
export type AddressResolve = (name: string) => Promise<string[]>;

/** Предел ожидания ответа DNS. */
const TIMEOUT_MS = 10_000;

/**
 * Разрешает адрес окружения в IP (спека 3.1).
 *
 * Не бросает исключений: неразрешимое имя — данные проверки, а не авария.
 * Несколько записей — берётся первая: раунд-робин здесь не поддерживается.
 */
export async function resolveAddress(
  name: string,
  resolveFn: AddressResolve = resolvePublicRecord,
): Promise<ResolveResult> {
  try {
    const [ip] = await resolveFn(name);

    return ip ? { ip, error: null } : { ip: null, error: 'запись не найдена' };
  } catch (cause) {
    return {
      ip: null,
      error: cause instanceof Error ? cause.message : 'неизвестная ошибка',
    };
  }
}

/**
 * Спрашивает DNS напрямую, минуя `/etc/hosts`.
 *
 * `resolve4`, а не `lookup`: нужна публичная запись имени, а не то, что
 * подставит системный резолвер контейнера. Зоны без A-записи спрашиваются
 * по AAAA — окружение может жить и на IPv6.
 */
async function resolvePublicRecord(name: string): Promise<string[]> {
  const resolver = new Resolver({ timeout: TIMEOUT_MS, tries: 1 });

  try {
    return await resolver.resolve4(name);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENODATA') {
      return resolver.resolve6(name);
    }

    throw cause;
  }
}
