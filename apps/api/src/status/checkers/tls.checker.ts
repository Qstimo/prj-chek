import { connect } from 'node:tls';

import { StatusCheckCode } from '@cairn/shared';

import { failureOf, phraseOf } from './failure';
import { timeoutMsOf } from './settings';

/** Результат проверки сертификата. */
export interface TlsResult {
  validTo: Date | null;
  /**
   * Приняла ли система сертификат. `null` — рукопожатия не было.
   *
   * Отдельно от срока: пока проверка читала один `valid_to`, зелёное
   * «TLS до 2027-03-01» уживалось с красным «не отвечает» — `fetch`
   * отвергал сертификат, которому эта проверка верила, потому что
   * коннектилась с `rejectUnauthorized: false`.
   */
  trusted: boolean | null;
  /** Чем сертификат не угодил либо почему рукопожатие не вышло. */
  code: StatusCheckCode | null;
  error: string | null;
}

/** Итог рукопожатия: срок из сертификата и вердикт проверки доверия. */
export interface TlsHandshake {
  validTo: Date | null;
  /**
   * Код отказа в доверии словами Node; `null` — сертификат принят.
   *
   * Сверку имени Node делает сам, когда передан `servername`: расхождение
   * приходит здесь кодом `ERR_TLS_CERT_ALTNAME_INVALID` (проверено
   * вживую), и второй её экземпляр нам не нужен.
   */
  authorizationError: string | null;
}

/** Рукопожатие с адресом; в тестах подменяется подделкой. */
export type TlsConnect = (domain: string) => Promise<TlsHandshake>;

/** Настройка предела ожидания рукопожатия. */
export const TLS_TIMEOUT_ENV = 'CAIRN_TLS_CHECK_TIMEOUT_SECONDS';

/**
 * Проверяет сертификат домена (ТЗ 6): срок и доверие.
 *
 * Не бросает исключений: недоступный порт и сломанное рукопожатие —
 * данные проверки.
 */
export async function checkTls(
  domain: string,
  connectFn: TlsConnect = connectAndRead,
): Promise<TlsResult> {
  let handshake: TlsHandshake;

  try {
    handshake = await connectFn(domain);
  } catch (cause) {
    const failure = failureOf(cause);

    // Рукопожатия не было — о сертификате не известно ничего, и выдумывать
    // недоверие так же неверно, как доверие.
    return { validTo: null, trusted: null, code: failure.code, error: failure.phrase };
  }

  const trusted = handshake.authorizationError === null;

  if (!trusted) {
    const failure = failureOf(
      Object.assign(new Error(handshake.authorizationError!), {
        code: handshake.authorizationError,
      }),
    );

    return { validTo: handshake.validTo, trusted, code: failure.code, error: failure.phrase };
  }

  if (!handshake.validTo) {
    return {
      validTo: null,
      trusted,
      code: StatusCheckCode.CertificateMissing,
      error: phraseOf(StatusCheckCode.CertificateMissing, null),
    };
  }

  return { validTo: handshake.validTo, trusted, code: null, error: null };
}

/**
 * Устанавливает TLS-соединение и читает срок и вердикт доверия.
 *
 * `rejectUnauthorized: false` остаётся: просроченный и самоподписанный
 * сертификат — то, что мы хотим увидеть, а не повод отказаться от
 * разговора. Вердикт при этом не теряется — Node всё равно проверяет
 * цепочку и имя и складывает результат в `authorized` и
 * `authorizationError` (проверено вживую на самоподписанном, истёкшем и
 * выписанном на другое имя).
 */
function connectAndRead(domain: string): Promise<TlsHandshake> {
  return new Promise((resolve, reject) => {
    const socket = connect(
      {
        host: domain,
        port: 443,
        servername: domain,
        timeout: timeoutMsOf(process.env[TLS_TIMEOUT_ENV]),
        rejectUnauthorized: false,
      },
      () => {
        const certificate = socket.getPeerCertificate();
        const authorizationError = socket.authorized
          ? null
          : // `authorizationError` объявлен как `Error`, а приходит строкой
            // кода — читаем и то и другое, не полагаясь на объявление.
            String(
              (socket.authorizationError as unknown as { code?: string })?.code ??
                socket.authorizationError ??
                'UNKNOWN_CERT_ERROR',
            );

        socket.end();
        resolve({
          validTo: certificate?.valid_to ? new Date(certificate.valid_to) : null,
          authorizationError,
        });
      },
    );

    socket.on('timeout', () => {
      socket.destroy();
      reject(Object.assign(new Error('таймаут TLS-соединения'), { code: 'ETIMEDOUT' }));
    });
    socket.on('error', reject);
  });
}
