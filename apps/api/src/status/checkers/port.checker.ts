import { connect } from 'node:net';

import { StatusCheckCode, type IncidentPortProbe } from '@cairn/shared';

import { failureOf } from './failure';
import { timeoutMsOf } from './settings';

/** Настройка предела ожидания пробы порта. */
export const PORT_PROBE_TIMEOUT_ENV = 'CAIRN_PORT_PROBE_TIMEOUT_SECONDS';

/**
 * Предел ожидания пробы порта по умолчанию, в секундах.
 *
 * Короче прочих проверок: слепок снимается, пока падение идёт, и два
 * порта по десять секунд растянули бы его на двадцать — к концу он
 * описывал бы уже другую сеть.
 */
export const DEFAULT_PORT_PROBE_TIMEOUT_SECONDS = 3;

/**
 * Сокет настолько, насколько он нужен пробе.
 *
 * Своя узкая форма вместо `net.Socket`: пробе нужны три события и предел
 * ожидания, а в тестах — подделка, которая не ходит в сеть.
 */
export interface ProbeSocket {
  setTimeout(ms: number): unknown;
  once(event: string, listener: (cause?: unknown) => void): unknown;
  destroy(): unknown;
}

/** Открыватель соединения; в тестах подменяется подделкой. */
export type ProbeConnect = (options: { host: string; port: number }) => ProbeSocket;

/**
 * Стучится в порт машины и говорит, чем это кончилось.
 *
 * `net.connect`, а не `fetch`: вопрос не в том, что ответит служба, а в
 * том, доходит ли до неё SYN и приходит ли хоть что-то обратно. Ответ
 * разводит три беды, неразличимые в фразе «не отвечает»: отказ (`RST`) —
 * путь цел, не слушает служба; тишина — пакеты пропали по дороге; живой
 * `80` при мёртвом `443` — фильтр по порту.
 *
 * ⚠️ Проба врёт на машине за туннелем, VPN или прокси: такой клиент
 * принимает соединение локально и отвечает за любой адрес сам — измерено
 * на рабочей машине, где проба до `198.51.100.1` (RFC 5737, маршрута нет
 * ни у кого) «подключилась». В развёртывании CAIRN живёт в контейнере без
 * туннеля, и это названная граница метода, а не недоработка: HTTP-проверке
 * такой клиент соврать не может, и вердикт о падении по-прежнему её.
 *
 * Не бросает исключений: отказ — это и есть результат пробы.
 */
export async function checkPort(
  host: string,
  port: number,
  timeoutMs: number = timeoutMsOf(
    process.env[PORT_PROBE_TIMEOUT_ENV],
    DEFAULT_PORT_PROBE_TIMEOUT_SECONDS,
  ),
  connectFn: ProbeConnect = (options) => connect(options),
): Promise<IncidentPortProbe> {
  const startedAt = Date.now();

  return new Promise<IncidentPortProbe>((resolve) => {
    const socket = connectFn({ host, port });
    let answered = false;
    // Один ответ на пробу: сокет отдаёт и `error`, и `close`, а второй
    // `resolve` молча потерялся бы вместе с разницей между отказом и
    // тишиной.
    const answer = (code: StatusCheckCode | null): void => {
      if (answered) {
        return;
      }

      answered = true;
      socket.destroy();
      resolve({ port, code, ms: Date.now() - startedAt });
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => answer(null));
    // Разбор отказа — общий с остальными проверками: `ECONNREFUSED`,
    // `EHOSTUNREACH` и `ENOTFOUND` означают здесь то же, что и там, и
    // второй карты кодов быть не должно.
    socket.once('error', (cause) => answer(failureOf(cause).code));
    socket.once('timeout', () => answer(StatusCheckCode.Timeout));
  });
}
