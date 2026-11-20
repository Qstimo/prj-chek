import { timeoutMsOf } from './settings';

/** Настройка контрольных адресов; пустое значение выключает проверку. */
export const CONTROL_URLS_ENV = 'CAIRN_STATUS_CONTROL_URLS';

/** Настройка предела ожидания контрольного хоста. */
export const CONTROL_TIMEOUT_ENV = 'CAIRN_STATUS_CONTROL_TIMEOUT_SECONDS';

/**
 * Предел ожидания контрольного хоста по умолчанию, в секундах.
 *
 * Короче прочих проверок: этот вопрос задаётся уже в момент падения, и
 * ответ на него нужен прежде, чем прогон решит, рассылать ли пуши.
 */
export const DEFAULT_CONTROL_TIMEOUT_SECONDS = 5;

/**
 * Контрольные адреса по умолчанию: два разных хостера.
 *
 * Два, а не один: один контрольный хост может быть заблокирован у
 * провайдера или сам лежать, и тогда его молчание выдало бы себя за нашу
 * слепоту. Адреса выбраны отдающие короткий статический ответ.
 */
export const DEFAULT_CONTROL_URLS = [
  'https://ya.ru/robots.txt',
  'https://www.cloudflare.com/cdn-cgi/trace',
];

/** Что известно о нашем выходе в сеть. */
export interface UplinkResult {
  /** Сколько хостов спрашивали; `0` — проверка выключена настройкой. */
  urls: number;
  alive: number;
  /**
   * Потеряна ли сеть у нас: спрошены все и не ответил никто.
   *
   * Выключенная проверка сети не теряет: отсутствие знания — не вердикт.
   */
  isLost: boolean;
}

/** Запрос к контрольному хосту; в тестах подменяется подделкой. */
export type UplinkFetch = (
  url: string,
  init: { redirect: 'manual'; signal: AbortSignal },
) => Promise<{ status: number }>;

/** Список контрольных адресов из настройки. */
export function controlUrlsOf(value: string | undefined): string[] {
  if (value === undefined) {
    return DEFAULT_CONTROL_URLS;
  }

  return value
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
}

/**
 * Спрашивает контрольные хосты: есть ли сеть у нас самих.
 *
 * Нужно ровно затем, чтобы не объявить падением двадцати проектов
 * собственную потерю сети: проверки идут из контейнера, и для адресов
 * всех проектов такая потеря выглядит одинаково — «сети до адреса нет».
 * Пуш о падении каждого проекта в этот момент — худшее, что система может
 * сделать: он и ложен, и приходит пачкой.
 *
 * Спрашивается первый ответивший, а не все: вопрос в том, доходит ли
 * запрос хоть куда-нибудь. Ответом считается только успех — `5xx` отдаёт
 * и перехватчик на пути.
 *
 * Не бросает исключений: отказ контрольного хоста — это и есть данные.
 */
export async function checkUplink(
  urls: string[] = controlUrlsOf(process.env[CONTROL_URLS_ENV]),
  fetchFn: UplinkFetch = fetch,
): Promise<UplinkResult> {
  let alive = 0;

  for (const url of urls) {
    try {
      const response = await fetchFn(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(
          timeoutMsOf(process.env[CONTROL_TIMEOUT_ENV], DEFAULT_CONTROL_TIMEOUT_SECONDS),
        ),
      });

      // Непрозрачный ответ (`status === 0`) — это тоже ответ: запрос
      // куда-то дошёл. Считать его молчанием значило бы ошибиться в
      // сторону ложной слепоты, а она гасит настоящие падения.
      if (response.status === 0 || response.status < 400) {
        alive += 1;
        break;
      }
    } catch {
      // Молчание хоста — наблюдение, а не авария: о нём и говорит счёт.
    }
  }

  return { urls: urls.length, alive, isLost: urls.length > 0 && alive === 0 };
}
