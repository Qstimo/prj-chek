import { StatusCheckCode } from '@cairn/shared';

/** Разобранный отказ: код для расшифровки и фраза для человека. */
export interface Failure {
  code: StatusCheckCode;
  /** Сырой код Node или OpenSSL, если он был: с ним идут разбираться дальше. */
  raw: string | null;
  /** Фраза для человека, собранная по коду. */
  phrase: string;
}

/** Разобранный ответ сервера: код, фраза и падение ли это. */
export interface HttpFailure extends Failure {
  /** Считать ли адрес упавшим: от этого зависят инцидент и пуш. */
  isDown: boolean;
}

/**
 * Русские фразы по кодам наблюдений.
 *
 * `Record` без знака вопроса намеренно: новый код перечисления обязан
 * получить фразу, и TypeScript проведёт по этому месту.
 */
const PHRASES: Record<StatusCheckCode, string> = {
  [StatusCheckCode.Redirect]: 'отвечает перенаправлением',
  [StatusCheckCode.AuthRequired]: 'закрыто авторизацией',
  [StatusCheckCode.MethodNotAllowed]: 'метод не разрешён',
  [StatusCheckCode.PathNotFound]: 'ручка проверки не найдена',
  [StatusCheckCode.ClientError]: 'адрес отказывает запросу',
  [StatusCheckCode.ServerError]: 'сервер ответил ошибкой',
  [StatusCheckCode.Timeout]: 'ответа не дождались',
  [StatusCheckCode.ConnectionRefused]: 'соединение отвергнуто',
  [StatusCheckCode.ConnectionReset]: 'соединение разорвано',
  [StatusCheckCode.Unreachable]: 'сети до адреса нет',
  [StatusCheckCode.ProtocolError]: 'порт отвечает не по этому протоколу',
  [StatusCheckCode.DnsNotFound]: 'имени нет в DNS',
  [StatusCheckCode.DnsNoRecord]: 'у имени нет адресной записи',
  [StatusCheckCode.DnsTemporary]: 'DNS сейчас не отвечает',
  [StatusCheckCode.CertificateUntrusted]: 'сертификат не вызывает доверия',
  [StatusCheckCode.CertificateExpired]: 'сертификат истёк',
  [StatusCheckCode.CertificateNameMismatch]: 'сертификат выписан на другое имя',
  [StatusCheckCode.CertificateMissing]: 'сертификат без срока действия',
  [StatusCheckCode.RegistryNotFound]: 'реестр не знает этого домена',
  [StatusCheckCode.RegistryNoExpiration]: 'реестр не сообщил срок',
  [StatusCheckCode.RegistryUnavailable]: 'реестр недоступен',
  [StatusCheckCode.Unknown]: 'причина неизвестна',
};

/**
 * Коды Node, libuv, c-ares и OpenSSL, сведённые к нашему перечню.
 *
 * Список не полон и полным быть не может: OpenSSL пополняет свой без
 * нашего участия. Поэтому после точного поиска работают правила по виду
 * кода, а нераспознанный код доезжает до человека как есть.
 */
const CODE_BY_RAW: Record<string, StatusCheckCode> = {
  ECONNREFUSED: StatusCheckCode.ConnectionRefused,
  ECONNRESET: StatusCheckCode.ConnectionReset,
  EPIPE: StatusCheckCode.ConnectionReset,
  ECONNABORTED: StatusCheckCode.ConnectionReset,
  ETIMEDOUT: StatusCheckCode.Timeout,
  ABORT_ERR: StatusCheckCode.Timeout,
  ERR_SOCKET_CONNECTION_TIMEOUT: StatusCheckCode.Timeout,
  UND_ERR_CONNECT_TIMEOUT: StatusCheckCode.Timeout,
  UND_ERR_HEADERS_TIMEOUT: StatusCheckCode.Timeout,
  UND_ERR_BODY_TIMEOUT: StatusCheckCode.Timeout,
  ENETUNREACH: StatusCheckCode.Unreachable,
  EHOSTUNREACH: StatusCheckCode.Unreachable,
  ENETDOWN: StatusCheckCode.Unreachable,
  ENOTFOUND: StatusCheckCode.DnsNotFound,
  NOTFOUND: StatusCheckCode.DnsNotFound,
  ENXDOMAIN: StatusCheckCode.DnsNotFound,
  ENODATA: StatusCheckCode.DnsNoRecord,
  EAI_AGAIN: StatusCheckCode.DnsTemporary,
  ESERVFAIL: StatusCheckCode.DnsTemporary,
  EREFUSED: StatusCheckCode.DnsTemporary,
  // `ETIMEOUT` — код c-ares, а не libuv: так отвечает именно DNS.
  ETIMEOUT: StatusCheckCode.DnsTemporary,
  EPROTO: StatusCheckCode.ProtocolError,
  EPROTOTYPE: StatusCheckCode.ProtocolError,
  CERT_HAS_EXPIRED: StatusCheckCode.CertificateExpired,
  ERR_TLS_CERT_ALTNAME_INVALID: StatusCheckCode.CertificateNameMismatch,
  ERR_TLS_CERT_ALTNAME_FORMAT: StatusCheckCode.CertificateNameMismatch,
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: StatusCheckCode.CertificateUntrusted,
  UNABLE_TO_GET_ISSUER_CERT: StatusCheckCode.CertificateUntrusted,
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: StatusCheckCode.CertificateUntrusted,
  DEPTH_ZERO_SELF_SIGNED_CERT: StatusCheckCode.CertificateUntrusted,
  SELF_SIGNED_CERT_IN_CHAIN: StatusCheckCode.CertificateUntrusted,
  CERT_UNTRUSTED: StatusCheckCode.CertificateUntrusted,
  CERT_NOT_YET_VALID: StatusCheckCode.CertificateUntrusted,
  CERT_REVOKED: StatusCheckCode.CertificateUntrusted,
  HOSTNAME_MISMATCH: StatusCheckCode.CertificateNameMismatch,
};

/**
 * Коды, означающие «ручка проверки настроена не так», а не «сервер лежит».
 *
 * 404 — путь задан неверно, прочие `4xx` — адрес отказывает запросу.
 * Правило лежит здесь, а не в двух местах: по нему проверка решает,
 * писать ли фразу, а правила предупреждений — поднимать ли жёлтое.
 */
const MISCONFIGURED: StatusCheckCode[] = [StatusCheckCode.PathNotFound, StatusCheckCode.ClientError];

/** Говорит ли код о настройке проверки, а не о падении. */
export function isMisconfigured(code: StatusCheckCode | null): boolean {
  return code !== null && MISCONFIGURED.includes(code);
}

/** Фраза по коду; сырой код приписывается в скобках — с ним идут искать. */
export function phraseOf(code: StatusCheckCode, raw: string | null): string {
  return raw ? `${PHRASES[code]} (${raw})` : PHRASES[code];
}

/**
 * Разбирает отказ до корня цепочки `Error.cause`.
 *
 * `fetch` всегда бросает `TypeError: fetch failed`, а настоящая причина
 * лежит глубже — `ECONNREFUSED`, `ENOTFOUND`, `EPROTO`,
 * `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Пока брали сообщение обёртки, все
 * отказы сворачивались в одну бесполезную фразу.
 */
export function failureOf(cause: unknown): Failure {
  const raw = rawCodeOf(cause);
  const code = raw ? codeOfRaw(raw) : codeOfName(cause);

  return { code, raw, phrase: phraseOf(code, raw) };
}

/**
 * Трактует ответ сервера (раздел 3 дизайна).
 *
 * Правило `status < 400 → жив` объявляло падением адрес за авторизацией и
 * адрес, не принимающий `GET`, и будило человека пушем. Падение теперь —
 * только `5xx`: `4xx` говорит о том, как настроена проверка, а не о том,
 * что сервер лежит.
 */
export function httpFailureOf(status: number): HttpFailure {
  const code = codeOfStatus(status);
  const raw = `HTTP ${status}`;

  return {
    code,
    raw,
    phrase: phraseOf(code, raw),
    isDown: code === StatusCheckCode.ServerError,
  };
}

/** Код ответа, сведённый к наблюдению. */
function codeOfStatus(status: number): StatusCheckCode {
  if (status >= 500) {
    return status === 501 ? StatusCheckCode.MethodNotAllowed : StatusCheckCode.ServerError;
  }

  if (status === 401 || status === 403) {
    return StatusCheckCode.AuthRequired;
  }

  if (status === 405) {
    return StatusCheckCode.MethodNotAllowed;
  }

  if (status === 404) {
    return StatusCheckCode.PathNotFound;
  }

  return StatusCheckCode.ClientError;
}

/**
 * Сырой код из цепочки причин.
 *
 * Берётся первый встреченный строковый `code`: у `DOMException` он
 * числовой (`23` у таймаута), и принимать его за код нельзя.
 */
function rawCodeOf(cause: unknown): string | null {
  let current = cause;

  // Предел обхода: цепочка причин в теории может замкнуться сама на себя.
  for (let depth = 0; depth < 10 && current instanceof Error; depth += 1) {
    const code = (current as { code?: unknown }).code;

    if (typeof code === 'string' && code.length > 0) {
      return code;
    }

    current = current.cause;
  }

  return null;
}

/** Код по сырому коду: точный список, затем правила по виду. */
function codeOfRaw(raw: string): StatusCheckCode {
  const known = CODE_BY_RAW[raw];

  if (known) {
    return known;
  }

  // Правила по виду кода — на случай значений, которых нет в списке.
  // Сертификатных кодов у OpenSSL десятки, и все они об одном: мы не
  // смогли признать сертификат своим.
  if (raw.startsWith('ERR_SSL_')) {
    return StatusCheckCode.ProtocolError;
  }

  if (
    raw.includes('CERT') ||
    raw.includes('SIGNATURE') ||
    raw.includes('ISSUER') ||
    raw.startsWith('ERR_TLS_')
  ) {
    return StatusCheckCode.CertificateUntrusted;
  }

  return StatusCheckCode.Unknown;
}

/**
 * Код по имени ошибки — для отказов без кода.
 *
 * `AbortSignal.timeout` отклоняет `DOMException` с именем `TimeoutError`:
 * кода-строки у неё нет вовсе, а повод для вывода есть.
 */
function codeOfName(cause: unknown): StatusCheckCode {
  if (!(cause instanceof Error)) {
    return StatusCheckCode.Unknown;
  }

  return cause.name === 'TimeoutError' || cause.name === 'AbortError'
    ? StatusCheckCode.Timeout
    : StatusCheckCode.Unknown;
}
