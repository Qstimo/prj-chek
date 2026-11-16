import { Resolver } from 'node:dns/promises';

import { StatusCheckCode } from '@cairn/shared';

import { failureOf, phraseOf } from './failure';
import { timeoutMsOf, triesOf } from './settings';

/** Результат разрешения имени. */
export interface ResolveResult {
  /**
   * Все адреса записи по возрастанию; пустой список — разрешить не вышло.
   *
   * Все, а не первый: резолверы ротируют порядок ответа, и выбранный
   * адрес плясал от прогона к прогону — предупреждение о расхождении
   * мигало вместе с ним. По множеству же видно правду: имя за CDN
   * смотрит на край сети, а не на машину.
   *
   * Упорядочены, чтобы одно и то же множество давало одну и ту же
   * запись: сравнение со прошлым прогоном иначе шумело бы порядком.
   */
  ips: string[];
  /** Что увидели: `null` — адреса получены. */
  code: StatusCheckCode | null;
  error: string | null;
}

/** Разрешение имени в список адресов; в тестах подменяется подделкой. */
export type AddressResolve = (name: string) => Promise<string[]>;

/** Настройка предела ожидания ответа DNS. */
export const DNS_TIMEOUT_ENV = 'CAIRN_DNS_TIMEOUT_SECONDS';

/** Настройка числа попыток запроса к DNS. */
export const DNS_TRIES_ENV = 'CAIRN_DNS_TRIES';

/**
 * Разрешает адрес окружения в IP (спека 3.1).
 *
 * Не бросает исключений: неразрешимое имя — данные проверки, а не авария.
 */
export async function resolveAddress(
  name: string,
  resolveFn: AddressResolve = resolvePublicRecord,
): Promise<ResolveResult> {
  try {
    const ips = [...new Set(await resolveFn(name))].sort();

    if (ips.length > 0) {
      return { ips, code: null, error: null };
    }

    return {
      ips: [],
      code: StatusCheckCode.DnsNoRecord,
      error: phraseOf(StatusCheckCode.DnsNoRecord, null),
    };
  } catch (cause) {
    const failure = failureOf(cause);

    return { ips: [], code: failure.code, error: failure.phrase };
  }
}

/**
 * Спрашивает DNS напрямую, минуя `/etc/hosts`.
 *
 * `resolve4`, а не `lookup`: нужна публичная запись имени, а не то, что
 * подставит системный резолвер контейнера. Зоны без A-записи спрашиваются
 * по AAAA — окружение может жить и на IPv6.
 *
 * Попыток больше одной: DNS ходит по UDP, и потерянный пакет читался как
 * «имени нет» — разрешение пропадало на один прогон вместе со всем, что
 * из него следует.
 */
async function resolvePublicRecord(name: string): Promise<string[]> {
  const resolver = new Resolver({
    timeout: timeoutMsOf(process.env[DNS_TIMEOUT_ENV]),
    tries: triesOf(process.env[DNS_TRIES_ENV]),
  });

  try {
    return await resolver.resolve4(name);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENODATA') {
      return resolver.resolve6(name);
    }

    throw cause;
  }
}
