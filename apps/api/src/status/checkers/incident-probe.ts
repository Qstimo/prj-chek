import type { IncidentProbe } from '@cairn/shared';

import { canonicalIpOf } from '../canonical-ip';
import { resolveAddress as resolveAddressReal } from './address.checker';
import { checkPort as checkPortReal } from './port.checker';

/**
 * Порты, которые спрашивает слепок.
 *
 * Два и зашиты в исходник, без переменной окружения: `443` — тот самый,
 * по которому идёт проверка, а `80` отвечает на единственный вопрос,
 * который делает слепок полезным, — мёртв весь путь до машины или фильтр
 * снял один порт. Третий порт (вроде `22`) добавил бы к ответу
 * «кто-то пускает нас на машину», а решения по нему нет: в ТЗ нет
 * доступа к машинам.
 */
export const PROBE_PORTS = [443, 80] as const;

/** Чем снимается слепок; в тестах подменяется подделками. */
export interface ProbeDeps {
  resolveAddress: typeof resolveAddressReal;
  checkPort: typeof checkPortReal;
}

/**
 * Снимает слепок момента падения: куда смотрит имя и что с портами.
 *
 * Зовётся один раз — при открытии инцидента, пока падение идёт. Причину
 * падения слепок не заменяет, а объясняет: по фразе «ответа не
 * дождались» нельзя понять, к кому идти — к себе, к хостеру или к
 * провайдеру, — а по отказу на `443` при живом `80` можно.
 *
 * Не бросает исключений и ничего не требует: отказ любой из проб
 * оставляет её часть слепка пустой. Потерять инцидент из-за диагностики
 * было бы хуже, чем не узнать подробностей.
 */
export async function probeAddress(
  name: string,
  at: Date,
  deps: ProbeDeps = { resolveAddress: resolveAddressReal, checkPort: checkPortReal },
): Promise<IncidentProbe> {
  const resolved = await deps
    .resolveAddress(name)
    .catch(() => ({ ips: [] as string[], code: null, error: null }));

  // Тот же выбор машины, что у привязки окружения, и тем же правилом:
  // резолверы ротируют порядок ответа, и проба плясала бы вместе с ним
  // от падения к падению.
  const machine = canonicalIpOf(resolved.ips);
  const ports = machine
    ? await Promise.all(PROBE_PORTS.map((port) => deps.checkPort(machine, port))).catch(() => [])
    : [];

  return {
    at: at.toISOString(),
    resolvedIps: resolved.ips,
    resolveError: resolved.error,
    ports,
  };
}
