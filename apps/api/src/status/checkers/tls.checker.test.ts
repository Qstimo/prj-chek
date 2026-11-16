import { StatusCheckCode } from '@cairn/shared';
import { describe, expect, it, vi } from 'vitest';

import { checkTls } from './tls.checker';

/** Итог рукопожатия: срок и то, что сказала проверка доверия. */
function handshake(validTo: string | null, authorizationError: string | null = null) {
  return { validTo: validTo ? new Date(validTo) : null, authorizationError };
}

describe('checkTls', () => {
  it('возвращает срок действия сертификата', async () => {
    const connectFn = vi.fn().mockResolvedValue(handshake('2026-12-01T00:00:00Z'));

    const result = await checkTls('example.com', connectFn);

    expect(result.validTo?.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(result.error).toBeNull();
    expect(connectFn).toHaveBeenCalledWith('example.com');
  });

  it('доверенный сертификат отмечается доверенным', async () => {
    // Пока проверка читала один `valid_to`, зелёное «TLS до 2027-03-01»
    // уживалось с красным «не отвечает»: `fetch` отвергал сертификат,
    // которому эта проверка верила.
    const result = await checkTls('example.com', vi.fn().mockResolvedValue(handshake('2027-03-01T00:00:00Z')));

    expect(result.trusted).toBe(true);
    expect(result.code).toBeNull();
  });

  it('самоподписанный сертификат: срок известен, доверия нет', async () => {
    // Срок нужен всё равно — за ним ходили, — но рядом с ним обязана
    // стоять правда о доверии.
    const connectFn = vi
      .fn()
      .mockResolvedValue(handshake('2028-11-09T21:00:15Z', 'DEPTH_ZERO_SELF_SIGNED_CERT'));

    const result = await checkTls('self-signed.example.com', connectFn);

    expect(result.validTo?.toISOString()).toBe('2028-11-09T21:00:15.000Z');
    expect(result.trusted).toBe(false);
    expect(result.code).toBe(StatusCheckCode.CertificateUntrusted);
    expect(result.error).toContain('DEPTH_ZERO_SELF_SIGNED_CERT');
  });

  it('истёкший сертификат отличается от непроверяемого', async () => {
    const connectFn = vi
      .fn()
      .mockResolvedValue(handshake('2015-04-12T23:59:59Z', 'CERT_HAS_EXPIRED'));

    const result = await checkTls('expired.example.com', connectFn);

    expect(result.trusted).toBe(false);
    expect(result.code).toBe(StatusCheckCode.CertificateExpired);
  });

  it('сертификат на другое имя отмечается своим кодом', async () => {
    // Сверку имени делает сам Node: `servername` передан, и расхождение
    // приходит кодом `ERR_TLS_CERT_ALTNAME_INVALID`.
    const connectFn = vi
      .fn()
      .mockResolvedValue(handshake('2026-12-28T20:02:55Z', 'ERR_TLS_CERT_ALTNAME_INVALID'));

    expect((await checkTls('wrong.example.com', connectFn)).code).toBe(
      StatusCheckCode.CertificateNameMismatch,
    );
  });

  it('ошибка соединения попадает в результат, а доверие остаётся неизвестным', async () => {
    const connectFn = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));

    const result = await checkTls('example.com', connectFn);

    expect(result.validTo).toBeNull();
    // Рукопожатия не было: судить о сертификате не по чему.
    expect(result.trusted).toBeNull();
    expect(result.code).toBe(StatusCheckCode.ConnectionRefused);
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('порт без TLS отличается от закрытого', async () => {
    const connectFn = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('wrong version number'), { code: 'EPROTO' }));

    expect((await checkTls('example.com', connectFn)).code).toBe(StatusCheckCode.ProtocolError);
  });

  it('рукопожатие без срока — названный случай, доверие при этом есть', async () => {
    // Доверие — вердикт проверки цепочки, и отсутствие срока его не
    // отменяет: о сроке говорит код, а не признак доверия.
    const result = await checkTls('example.com', vi.fn().mockResolvedValue(handshake(null)));

    expect(result.validTo).toBeNull();
    expect(result.code).toBe(StatusCheckCode.CertificateMissing);
    expect(result.trusted).toBe(true);
    expect(result.error).not.toBeNull();
  });
});
