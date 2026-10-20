import { pluralOf } from '../common/plural';
import { IncidentEventKind, type IncidentEvent } from '../incidents/incidents.service';

/** Готовое уведомление: то, что уходит в браузер нагрузкой. */
export interface NotificationText {
  title: string;
  body: string;
  /** Куда ведёт нажатие. */
  url: string;
  /** Метка замены в лотке. */
  tag: string;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Собирает текст уведомления по событию инцидента.
 *
 * Чистая функция без обращений к базе: текст — самое спорное место
 * уведомления, и его надо проверять таблицей случаев, а не глазами на
 * настоящем падении.
 */
export function notificationOf(event: IncidentEvent): NotificationText {
  const place = `${event.projectName} · ${event.environmentName}`;
  const isResolved = event.kind === IncidentEventKind.Resolved;

  const title = isResolved
    ? `${event.address} отвечает снова`
    : `${event.address} не отвечает`;

  const prefix = isResolved
    ? `лежал ${durationOf(event.startedAt, event.resolvedAt ?? event.startedAt)}`
    : event.cause;

  return {
    title,
    body: prefix ? `${prefix} · ${place}` : place,
    url: `/projects/${event.projectId}/infrastructure`,
    // Метка — адрес: новый пуш о том же адресе заменяет прежний, а не
    // ложится рядом с ним.
    tag: event.domainId,
  };
}

/** Длительность падения: минуты до часа, дальше часы. */
function durationOf(from: Date, to: Date): string {
  const elapsed = to.getTime() - from.getTime();

  if (elapsed < MINUTE_MS) {
    // Ноль минут выглядел бы ошибкой, а не коротким падением.
    return 'меньше минуты';
  }

  if (elapsed < HOUR_MS) {
    const minutes = Math.round(elapsed / MINUTE_MS);

    return `${minutes} ${pluralOf(minutes, ['минуту', 'минуты', 'минут'])}`;
  }

  const hours = Math.round(elapsed / HOUR_MS);

  return `${hours} ${pluralOf(hours, ['час', 'часа', 'часов'])}`;
}
