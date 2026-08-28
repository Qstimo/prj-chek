import { connect } from 'node:tls';

/** Результат проверки сертификата. */
export interface TlsResult {
  validTo: Date | null;
  error: string | null;
}

/** Возвращает срок действия сертификата домена; в тестах подменяется. */
export type TlsConnect = (domain: string) => Promise<Date>;

/** Предел ожидания рукопожатия. */
const TIMEOUT_MS = 10_000;

/**
 * Проверяет срок действия TLS-сертификата домена (ТЗ 6).
 *
 * Не бросает исключений: недоступный порт и сломанное рукопожатие —
 * данные проверки.
 */
export async function checkTls(
  domain: string,
  connectFn: TlsConnect = connectAndReadValidTo,
): Promise<TlsResult> {
  try {
    return { validTo: await connectFn(domain), error: null };
  } catch (cause) {
    return {
      validTo: null,
      error: cause instanceof Error ? cause.message : 'неизвестная ошибка',
    };
  }
}

/** Устанавливает TLS-соединение и читает `valid_to` из сертификата. */
function connectAndReadValidTo(domain: string): Promise<Date> {
  return new Promise((resolve, reject) => {
    const socket = connect(
      {
        host: domain,
        port: 443,
        servername: domain,
        timeout: TIMEOUT_MS,
        // Просроченный сертификат — то, что мы хотим увидеть, а не отказ.
        rejectUnauthorized: false,
      },
      () => {
        const certificate = socket.getPeerCertificate();
        socket.end();

        if (!certificate?.valid_to) {
          reject(new Error('сертификат не содержит срока действия'));

          return;
        }

        resolve(new Date(certificate.valid_to));
      },
    );

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('таймаут TLS-соединения'));
    });
    socket.on('error', reject);
  });
}
