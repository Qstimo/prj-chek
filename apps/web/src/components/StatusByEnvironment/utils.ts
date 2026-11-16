import { HealthState, StatusCheckCode, type DomainStatus } from '@cairn/shared';

import { CODE_LABELS } from '@/components/WarningsPanel';
import { formatDate } from '@/utils';

/** Проверки не было: один текст на все три столбца. */
export const NOT_CHECKED = 'Результата ещё нет';

/**
 * Коды, при которых адрес жив, но проверка увидела не то, чего ждала.
 *
 * Предупреждения по ним нет вовсе — это рабочее состояние стенда, — и без
 * пометки человек не понял бы, почему строка зелёная при 401.
 */
const LIVE_NOTE_CODES: StatusCheckCode[] = [
  StatusCheckCode.AuthRequired,
  StatusCheckCode.MethodNotAllowed,
  StatusCheckCode.Redirect,
];

/** Жив ли адрес: причина отказа важнее самого отказа. */
export function healthTextOf({ health, latencyMs, healthError }: DomainStatus): string {
  if (health === null) {
    return NOT_CHECKED;
  }

  if (health === HealthState.Up) {
    return latencyMs === null ? 'работает' : `работает, ${latencyMs} мс`;
  }

  return `не отвечает (${healthError ?? 'без причины'})`;
}

/**
 * Пометка у живого адреса: что именно увидела проверка.
 *
 * 401, 405 и редирект падением не считаются и предупреждения не дают, но
 * молчать о них нельзя: иначе зелёная строка у закрытой авторизацией
 * ручки выглядит как подтверждение, что приложение отвечает.
 */
export function healthNoteTextOf({ healthCode, redirectTo }: DomainStatus): string | null {
  if (healthCode === null || !LIVE_NOTE_CODES.includes(healthCode)) {
    return null;
  }

  const label = CODE_LABELS[healthCode];

  return healthCode === StatusCheckCode.Redirect && redirectTo
    ? `${label}: ${redirectTo}`
    : label;
}

/**
 * Сертификат: доверие прежде срока.
 *
 * Срок недоверенного сертификата не показывается вовсе — именно отсюда
 * росло зелёное «TLS до 2027-03-01» рядом с красным «не отвечает»:
 * `fetch` отвергал сертификат, которому проверка TLS верила.
 */
export function tlsTextOf({ tlsTrusted, tlsCode, tlsError, tlsValidTo }: DomainStatus): string {
  if (tlsTrusted === false) {
    return `не доверяем: ${tlsCode ? CODE_LABELS[tlsCode] : (tlsError ?? 'причина неизвестна')}`;
  }

  // Рукопожатия не было: о сертификате не известно ни срока, ни доверия.
  if (tlsError) {
    return `не проверить: ${tlsError}`;
  }

  return tlsValidTo ? `до ${dayOf(tlsValidTo)}` : NOT_CHECKED;
}

/** Срок регистрации по данным реестра зоны. */
export function registryTextOf({ registryError, registryExpiresAt }: DomainStatus): string {
  if (registryError) {
    return 'Сведения реестра недоступны';
  }

  return registryExpiresAt ? `до ${dayOf(registryExpiresAt)}` : NOT_CHECKED;
}

/** Registry diagnostics describe an external data source, never site availability. */
export function registryExplanationOf(error: string): string {
  return /не поддерживается|unsupported/i.test(error)
    ? 'Для этой доменной зоны в публичном реестре RDAP нет источника срока регистрации. Это не означает, что сайт недоступен.'
    : 'Внешний поставщик данных реестра не предоставил сведения. Это не означает, что сайт недоступен.';
}

/**
 * Где живёт имя: адреса, в которые оно разрешилось.
 *
 * Только адреса, без имени машины: статус открыт уровню «метаданные», а
 * имя сервера принадлежит уровню «чтение» и живёт в карточке окружения.
 * Множество, а не первая запись: резолверы ротируют порядок ответа, и
 * имя за CDN смотрит на край сети, а не на машину.
 */
export function placementTextOf({ resolvedIps, resolveError }: DomainStatus): string | null {
  if (resolvedIps.length > 0) {
    return resolveError
      ? `имя не разрешается: ${resolveError}; последние известные адреса: ${resolvedIps.join(', ')}`
      : `смотрит на ${resolvedIps.join(', ')}`;
  }

  return resolveError ? `имя не разрешается: ${resolveError}` : null;
}

/**
 * Когда проверяли. Без этого неясно, насколько свежее то, что показано.
 *
 * День и время вместе: статус считается по расписанию, и «13:00» без дня
 * у остановленного прогона читался бы как «только что».
 */
export function checkedAtTextOf(checkedAt: string | null): string {
  if (!checkedAt) {
    return 'Ожидает первой проверки';
  }

  const at = new Date(checkedAt);

  return `${at.toLocaleDateString('ru-RU')}, ${at.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

/** День без времени: час проверки сертификата человеку не нужен. */
function dayOf(iso: string): string {
  return formatDate(iso.slice(0, 10));
}
