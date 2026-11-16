import { StatusCheckCode } from '@cairn/shared';

import { failureOf, phraseOf } from './failure';
import { cacheMsOf, timeoutMsOf } from './settings';

/** Результат проверки срока регистрации. */
export interface DomainExpiryResult {
  expiresAt: Date | null;
  /** Что увидели: `null` — срок получен. */
  code: StatusCheckCode | null;
  error: string | null;
}

/** Функция запроса RDAP; в тестах подменяется подделкой. */
export type RdapFetch = (
  url: string,
  init: { signal: AbortSignal; redirect?: 'error' },
) => Promise<{ status: number; json: () => Promise<unknown> }>;

/** Чем подменить окружение запроса: обе подмены нужны только тестам. */
export interface DomainExpiryOptions {
  fetchFn?: RdapFetch;
  /** Часы для кэша: отдельно от `Date.now`, чтобы время можно было двигать. */
  now?: () => number;
}

/** Настройка предела ожидания ответа реестра. */
export const RDAP_TIMEOUT_ENV = 'CAIRN_RDAP_TIMEOUT_SECONDS';

/** Настройка срока жизни кэша ответов реестра, в часах; `0` — без кэша. */
export const RDAP_CACHE_ENV = 'CAIRN_RDAP_CACHE_HOURS';

/** Запомненный ответ реестра с отметкой времени. */
interface CachedAnswer {
  answer: DomainExpiryResult;
  at: number;
  fetchFn: RdapFetch;
}

/**
 * Ответы реестров, запомненные на срок кэша.
 *
 * В памяти процесса, а не в базе: это ускорение, а не состояние системы —
 * потеря кэша при перезапуске ничего не портит, а таблица потребовала бы
 * миграции и чистки.
 */
const cache = new Map<string, CachedAnswer>();

/** Забывает запомненные ответы. Нужно тестам и ручной перепроверке. */
export function clearDomainExpiryCache(): void {
  cache.clear();
  bootstraps.clear();
}

/** Реестр выбирается по первичному справочнику IANA, без догадок об адресах. */
export const RDAP_BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';

const BOOTSTRAP_CACHE_MS = 24 * 60 * 60 * 1000;
const FAILURE_CACHE_MS = 5 * 60 * 1000;

type Bootstrap = { services: [string[], string[]][] };
const bootstraps = new Map<RdapFetch, { body: Bootstrap; at: number }>();

/** Проверяет внешние данные до того, как они попадут в кэш справочника. */
function isBootstrap(body: unknown): body is Bootstrap {
  const services = (body as Partial<Bootstrap> | null)?.services;

  return Array.isArray(services) && services.every(service =>
    Array.isArray(service) && service.length === 2 && service.every(list =>
      Array.isArray(list) && list.every(value => typeof value === 'string'),
    ),
  );
}

/** Каждый запрос ограничен по времени и не следует за перенаправлениями. */
function request(fetchFn: RdapFetch, url: string) {
  return fetchFn(url, {
    signal: AbortSignal.timeout(timeoutMsOf(process.env[RDAP_TIMEOUT_ENV])),
    redirect: 'error',
  });
}

/** Справочник живёт сутки; неудачный запрос не подменяет его пустым списком. */
async function bootstrap(fetchFn: RdapFetch, now: () => number): Promise<Bootstrap> {
  const cached = bootstraps.get(fetchFn);

  if (cached && now() - cached.at < BOOTSTRAP_CACHE_MS) {
    return cached.body;
  }

  const response = await request(fetchFn, RDAP_BOOTSTRAP_URL);

  if (response.status !== 200) {
    throw new Error(`IANA RDAP bootstrap HTTP ${response.status}`);
  }

  const body = await response.json();

  if (!isBootstrap(body)) {
    throw new Error('Invalid IANA RDAP bootstrap');
  }

  bootstraps.set(fetchFn, { body, at: now() });

  return body;
}

/** Берёт только HTTPS-адрес из IANA, без учётных данных и параметров. */
function registryUrl(rootDomain: string, urls: string[]): string {
  const base = urls.map(value => new URL(value)).find(url =>
    url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash,
  );

  if (!base) {
    throw new Error('IANA registry has no secure RDAP endpoint');
  }

  const directory = base.href.endsWith('/') ? base.href : `${base.href}/`;

  return new URL(`domain/${encodeURIComponent(rootDomain)}`, directory).href;
}

/** Узнаёт срок корня; отсутствие данных реестра не означает падения адреса. */
export async function checkDomainExpiry(
  rootDomain: string,
  options: DomainExpiryOptions = {},
): Promise<DomainExpiryResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? Date.now;
  const ttlMs = cacheMsOf(process.env[RDAP_CACHE_ENV]);
  const remembered = cache.get(rootDomain);

  // Временный отказ не должен скрывать восстановившийся реестр на целые сутки.
  const answerTtlMs = remembered?.answer.error ? Math.min(ttlMs, FAILURE_CACHE_MS) : ttlMs;

  if (
    remembered && remembered.fetchFn === fetchFn &&
    answerTtlMs > 0 && now() - remembered.at < answerTtlMs
  ) {
    return remembered.answer;
  }

  const answer = await ask(rootDomain, fetchFn, now);

  if (ttlMs > 0) {
    cache.set(rootDomain, { answer, at: now(), fetchFn });
  }

  return answer;
}

/** Один вопрос реестру без оглядки на кэш. */
async function ask(
  rootDomain: string,
  fetchFn: RdapFetch,
  now: () => number,
): Promise<DomainExpiryResult> {
  try {
    const tld = rootDomain.toLowerCase().split('.').at(-1);
    const services = await bootstrap(fetchFn, now);
    const urls = services.services.find(([zones]) => zones.includes(tld ?? ''))?.[1];

    if (!urls?.length) {
      return {
        expiresAt: null,
        code: StatusCheckCode.RegistryUnavailable,
        error: `RDAP: зона .${tld} не поддерживается в IANA; срок регистрации недоступен`,
      };
    }

    const response = await request(fetchFn, registryUrl(rootDomain, urls));

    if (response.status !== 200) {
      // «Не знает домена» и «не может ответить» требуют разных действий:
      // первое — повод проверить, та ли зона, второе — подождать.
      const code =
        response.status === 404
          ? StatusCheckCode.RegistryNotFound
          : StatusCheckCode.RegistryUnavailable;

      return { expiresAt: null, code, error: phraseOf(code, `HTTP ${response.status}`) };
    }

    const body = (await response.json()) as {
      events?: { eventAction?: string; eventDate?: string }[];
    };

    const expiration = Array.isArray(body?.events)
      ? body.events.find(event => event?.eventAction === 'expiration')
      : undefined;
    const expiresAt = expiration?.eventDate ? new Date(expiration.eventDate) : null;

    // Негодная дата хуже отсутствующей: `Invalid Date` доехал бы до
    // колонки `timestamp` и уронил бы запись прогона.
    if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
      return {
        expiresAt: null,
        code: StatusCheckCode.RegistryNoExpiration,
        error: phraseOf(StatusCheckCode.RegistryNoExpiration, null),
      };
    }

    return { expiresAt, code: null, error: null };
  } catch (cause) {
    const failure = failureOf(cause);

    const detail = cause instanceof Error ? cause.message : String(cause);

    return {
      expiresAt: null,
      code: StatusCheckCode.RegistryUnavailable,
      error: `Данные регистрации недоступны: ${failure.phrase}; ${detail}`,
    };
  }
}
