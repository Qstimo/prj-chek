import { StatusCheckCode, type IncidentPortProbe, type IncidentProbe } from '@cairn/shared';

import { CODE_LABELS } from '@/components/WarningsPanel/constants';

/** Куда смотрело имя в момент падения. */
export function probePlacementTextOf(probe: IncidentProbe): string {
  if (probe.resolvedIps.length > 0) {
    return `имя смотрело на ${probe.resolvedIps.join(', ')}`;
  }

  // Причина названа, если она известна: «не разрешилось» без неё
  // заставляет гадать, молчал DNS или имени нет вовсе.
  return probe.resolveError
    ? `имя не разрешилось: ${probe.resolveError}`
    : 'имя не разрешилось';
}

/**
 * Что ответили порты машины; `null` — стучаться было некуда.
 *
 * Фразы кодов — те же, что у предупреждений статуса: второй карты
 * расшифровок быть не должно.
 */
export function probePortsTextOf(probe: IncidentProbe): string | null {
  if (probe.ports.length === 0) {
    return null;
  }

  return probe.ports.map(portTextOf).join(', ');
}

/**
 * Вывод из слепка одной фразой; `null` — выводить не из чего.
 *
 * Весь смысл слепка в этой строке: фраза «ответа не дождались» не
 * говорит, к кому идти, а «машина отвечает отказом» или «фильтр по
 * порту» — говорят. Порядок проверок — от самой однозначной улики к
 * самой общей, как в разборе сбоя у монитора мессенджера.
 */
export function probeVerdictTextOf(probe: IncidentProbe): string | null {
  if (probe.resolvedIps.length === 0) {
    return probe.resolveError
      ? 'Имя не разрешилось: разбираться надо с DNS, а не с машиной — до неё дело не дошло.'
      : null;
  }

  if (probe.ports.length === 0) {
    return null;
  }

  const refused = probe.ports.filter(
    (port) => port.code === StatusCheckCode.ConnectionRefused,
  );
  const open = probe.ports.filter((port) => port.code === null);

  // Отказ — самая однозначная улика: обратный пакет дошёл, значит путь до
  // машины цел целиком, и дело не в сети.
  if (refused.length > 0) {
    return `Машина отвечает отказом на ${listOf(refused)}: путь до неё цел, не слушает служба. Это к нам, а не к провайдеру.`;
  }

  if (open.length > 0) {
    return open.length === probe.ports.length
      ? 'Машина принимает соединения на всех проверенных портах: беда выше уровня сети — служба или край.'
      : `Машина принимает соединения на ${listOf(open)}, а остальные молчат: похоже на фильтр по порту — вопрос к провайдеру или хостеру.`;
  }

  return 'Все проверенные порты молчат: оборван путь до машины или наш адрес отфильтрован целиком.';
}

/** «443 — порт закрыт (4 мс)». */
function portTextOf(port: IncidentPortProbe): string {
  const outcome = port.code === null ? 'принял соединение' : CODE_LABELS[port.code];

  return `${port.port} — ${outcome} (${port.ms} мс)`;
}

/** «443 и 80» — перечисление портов для фразы вывода. */
function listOf(ports: IncidentPortProbe[]): string {
  const numbers = ports.map((port) => String(port.port));

  return numbers.length > 1
    ? `${numbers.slice(0, -1).join(', ')} и ${numbers.at(-1)}`
    : `${numbers[0]}`;
}
