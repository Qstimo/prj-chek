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
  init: { signal: AbortSignal },
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
}

/**
 * Узнаёт срок регистрации домена через RDAP (ТЗ 6).
 *
 * `rdap.org` — bootstrap-сервис реестров: он переадресует на реестр
 * нужной зоны. Зоны без RDAP и сетевые ошибки — данные проверки.
 *
 * Спрашивается **корень**, а не имя адреса: реестры знают только то, за
 * что платят, и пока вопрос задавался по поддомену, у каждого адреса
 * висело вечное «реестр ответил HTTP 404». Корень выбирает вызывающий —
 * у него он есть связью `environment_domains.domainId`, и эта связь
 * точнее любого разбора имени: список зон с именами третьего уровня у нас
 * закрытый и неполон по устройству.
 *
 * Ответ запоминается на сутки: срок меняется раз в год, а прогон идёт
 * каждые четверть часа по каждому адресу. Отказ запоминается тоже — зона
 * без RDAP отказывает столь же устойчиво, сколько реестр сообщает срок, и
 * стучать в закрытую дверь 96 раз в сутки незачем. Цена ошибки в обе
 * стороны — сутки запоздавшего знания о сроке, который меняется раз в год.
 */
export async function checkDomainExpiry(
  rootDomain: string,
  options: DomainExpiryOptions = {},
): Promise<DomainExpiryResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? Date.now;
  const ttlMs = cacheMsOf(process.env[RDAP_CACHE_ENV]);
  const remembered = cache.get(rootDomain);

  if (ttlMs > 0 && remembered && now() - remembered.at < ttlMs) {
    return remembered.answer;
  }

  const answer = await ask(rootDomain, fetchFn);

  if (ttlMs > 0) {
    cache.set(rootDomain, { answer, at: now() });
  }

  return answer;
}

/** Один вопрос реестру без оглядки на кэш. */
async function ask(rootDomain: string, fetchFn: RdapFetch): Promise<DomainExpiryResult> {
  try {
    const response = await fetchFn(`https://rdap.org/domain/${rootDomain}`, {
      signal: AbortSignal.timeout(timeoutMsOf(process.env[RDAP_TIMEOUT_ENV])),
    });

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

    const expiration = body.events?.find((event) => event.eventAction === 'expiration');
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

    return { expiresAt: null, code: failure.code, error: failure.phrase };
  }
}
