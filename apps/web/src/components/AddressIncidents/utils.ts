import type { Incident } from '@cairn/shared';

const MINUTE_S = 60;
const HOUR_S = 60 * MINUTE_S;
const DAY_S = 24 * HOUR_S;

/**
 * Склоняет единицу по числу: формы для 1, для 2–4 и для остальных.
 *
 * Своя копия, а не общая с API: это другое приложение, и тащить из него
 * код нельзя. Понадобится вебу во втором месте — переедет в `src/utils`.
 */
export function pluralOf(count: number, forms: [string, string, string]): string {
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return forms[2];
  }

  if (last === 1) {
    return forms[0];
  }

  return last >= 2 && last <= 4 ? forms[1] : forms[2];
}

/** «не отвечает с 14:20» — время начала открытого инцидента. */
export function downSinceTextOf(startedAt: string): string {
  const at = new Date(startedAt);
  const isToday = at.toDateString() === new Date().toDateString();
  const time = at.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  // Вчерашнее падение без даты выглядело бы свежим.
  return isToday
    ? `не отвечает с ${time}`
    : `не отвечает с ${at.toLocaleDateString('ru-RU')}, ${time}`;
}

/**
 * «падал 3 раза за 30 дней» — сколько падений задело окно.
 *
 * Окно названо рядом с числом: «падал 3 раза» без окна читается как
 * утверждение за всё время, а считается последний месяц. Само окно
 * приходит из контракта — зашивать тридцатку здесь значило бы разойтись
 * с сервером при первой же его правке.
 */
export function fallCountTextOf(count: number, windowDays: number): string {
  const falls = pluralOf(count, ['раз', 'раза', 'раз']);
  const days = pluralOf(windowDays, ['день', 'дня', 'дней']);

  return `падал ${count} ${falls} за ${windowDays} ${days}`;
}

/**
 * Суммарное время «не отвечает» за окно.
 *
 * Две старшие непустые единицы, не больше: «1 д 2 ч 15 мин 3 с» никому не
 * нужен, а «1 д» скрыл бы разницу между сутками и сутками с лишним.
 */
export function downtimeTextOf(seconds: number): string {
  if (seconds <= 0) {
    return 'не падал ни разу';
  }

  if (seconds < MINUTE_S) {
    return 'меньше минуты';
  }

  const days = Math.floor(seconds / DAY_S);
  const hours = Math.floor((seconds % DAY_S) / HOUR_S);
  const minutes = Math.floor((seconds % HOUR_S) / MINUTE_S);

  const parts = [
    days > 0 ? `${days} д` : null,
    hours > 0 ? `${hours} ч` : null,
    minutes > 0 ? `${minutes} мин` : null,
  ].filter((part): part is string => part !== null);

  return parts.slice(0, 2).join(' ');
}

/**
 * Доля времени, когда адрес отвечал.
 *
 * Округление вниз: «100%» у адреса, который за окно падал, — ложное
 * успокоение, а два знака после запятой и есть разница между девятками.
 */
export function uptimeTextOf(uptime: number): string {
  const percent = Math.floor(uptime * 10_000) / 100;

  return `${percent.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
}

/** Время по московскому формату: «11:20». */
function timeOf(at: Date): string {
  return at.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Отрезок падения целиком: «17.11.2026, 11:20 → 12:03».
 *
 * Дата конца пишется только тогда, когда он пришёлся на другой день:
 * иначе строка вдвое длиннее без единой новой мысли. А без неё
 * трёхсуточное падение читалось бы как сорокаминутное.
 */
export function incidentRangeTextOf(incident: Incident): string {
  const from = new Date(incident.startedAt);
  const start = `${from.toLocaleDateString('ru-RU')}, ${timeOf(from)}`;

  if (!incident.resolvedAt) {
    return `${start} → не закрыто`;
  }

  const to = new Date(incident.resolvedAt);
  const end =
    to.toDateString() === from.toDateString()
      ? timeOf(to)
      : `${to.toLocaleDateString('ru-RU')}, ${timeOf(to)}`;

  return `${start} → ${end}`;
}

/**
 * Длительность падения без округления до старшей единицы.
 *
 * Отличается от {@link downtimeTextOf} намеренно: сводка за окно
 * отвечает на вопрос «много ли», и там две старшие единицы — то, что
 * нужно. Отдельное падение отвечает на вопрос «сколько именно», и
 * «159 часов» вместо «6 д 16 ч 12 мин» прячет ответ.
 */
export function exactDurationTextOf(incident: Incident): string {
  if (!incident.resolvedAt) {
    return '';
  }

  const seconds = Math.max(
    0,
    Math.round(
      (new Date(incident.resolvedAt).getTime() - new Date(incident.startedAt).getTime()) / 1000,
    ),
  );

  if (seconds < MINUTE_S) {
    // Мигнувший на полминуты адрес и лежавший минуту — разные события.
    return `${seconds} с`;
  }

  const parts = [
    Math.floor(seconds / DAY_S) > 0 ? `${Math.floor(seconds / DAY_S)} д` : null,
    Math.floor((seconds % DAY_S) / HOUR_S) > 0
      ? `${Math.floor((seconds % DAY_S) / HOUR_S)} ч`
      : null,
    Math.floor((seconds % HOUR_S) / MINUTE_S) > 0
      ? `${Math.floor((seconds % HOUR_S) / MINUTE_S)} мин`
      : null,
  ].filter((part): part is string => part !== null);

  return parts.join(' ');
}

/**
 * Вилка возвращения: «ответил между 12:01 и 12:03».
 *
 * Момент закрытия — это время проверки, а не время события: адрес
 * поднялся где-то между последней упавшей проверкой и ответившей.
 * Назвать одно из них моментом возвращения значило бы выдать шаг прогона
 * за точность измерения. Вилка узкая, но не нулевая: пока падение
 * открыто, адрес переспрашивается своим шагом (минута по умолчанию), а не
 * раз в четверть часа вместе со всеми.
 *
 * @returns `null`, если вилки нет: падение открыто либо строка заведена
 * до появления подробностей и последней упавшей проверки не помнит.
 */
export function recoveryTextOf(incident: Incident): string | null {
  if (!incident.resolvedAt || !incident.lastDownAt) {
    return null;
  }

  return `ответил между ${timeOf(new Date(incident.lastDownAt))} и ${timeOf(new Date(incident.resolvedAt))}`;
}

/** «подтверждено 3 проверками» — сколько проверок застали адрес упавшим. */
export function checksTextOf(checks: number): string {
  return `подтверждено ${checks} ${pluralOf(checks, ['проверкой', 'проверками', 'проверками'])}`;
}

