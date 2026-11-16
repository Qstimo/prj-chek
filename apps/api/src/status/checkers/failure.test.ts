import { StatusCheckCode } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { failureOf, httpFailureOf, phraseOf } from './failure';

/** Ошибка с кодом — такой её и строит Node. */
function coded(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

describe('failureOf', () => {
  it('достаёт код из причины, а не из обёртки', () => {
    // `fetch` всегда бросает `TypeError: fetch failed`, а настоящий код
    // лежит в `cause`. Пока брали сообщение обёртки, все отказы
    // сворачивались в «не отвечает (fetch failed)».
    const error = new TypeError('fetch failed', {
      cause: coded('ECONNREFUSED', 'connect ECONNREFUSED 127.0.0.1:443'),
    });

    const failure = failureOf(error);

    expect(failure.code).toBe(StatusCheckCode.ConnectionRefused);
    expect(failure.raw).toBe('ECONNREFUSED');
    expect(failure.phrase).toContain('ECONNREFUSED');
    expect(failure.phrase).not.toContain('fetch failed');
  });

  it('разворачивает цепочку до корня', () => {
    const error = new TypeError('fetch failed', {
      cause: new Error('socket hang up', {
        cause: coded('ENOTFOUND', 'getaddrinfo ENOTFOUND stage.example.com'),
      }),
    });

    expect(failureOf(error).code).toBe(StatusCheckCode.DnsNotFound);
  });

  it('узнаёт таймаут по имени: кода-строки у него нет', () => {
    // `AbortSignal.timeout` отклоняет `DOMException` с именем
    // `TimeoutError` и числовым `code: 23` — числовой код за сырой
    // принимать нельзя.
    const error = new DOMException('The operation was aborted due to timeout', 'TimeoutError');

    const failure = failureOf(error);

    expect(failure.code).toBe(StatusCheckCode.Timeout);
    expect(failure.raw).toBeNull();
  });

  it('узнаёт непроверяемый сертификат', () => {
    const error = new TypeError('fetch failed', {
      cause: coded('UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'unable to verify the first certificate'),
    });

    expect(failureOf(error).code).toBe(StatusCheckCode.CertificateUntrusted);
  });

  it('узнаёт истёкший и чужой сертификат по отдельности', () => {
    expect(failureOf(coded('CERT_HAS_EXPIRED', 'certificate has expired')).code).toBe(
      StatusCheckCode.CertificateExpired,
    );
    expect(
      failureOf(coded('ERR_TLS_CERT_ALTNAME_INVALID', 'Hostname/IP does not match')).code,
    ).toBe(StatusCheckCode.CertificateNameMismatch);
  });

  it('незнакомый код про сертификат относит к недоверию, а не к «неизвестно»', () => {
    // Список кодов OpenSSL пополняется без нашего участия: правило по
    // виду кода честнее, чем «причина неизвестна».
    expect(failureOf(coded('CERT_CHAIN_TOO_LONG', 'что-то с цепочкой')).code).toBe(
      StatusCheckCode.CertificateUntrusted,
    );
  });

  it('порт, отвечающий не по протоколу, отличается от закрытого', () => {
    expect(failureOf(coded('EPROTO', 'wrong version number')).code).toBe(
      StatusCheckCode.ProtocolError,
    );
    expect(failureOf(coded('ECONNRESET', 'socket hang up')).code).toBe(
      StatusCheckCode.ConnectionReset,
    );
  });

  it('разбирает коды DNS по отдельности', () => {
    expect(failureOf(coded('ENODATA', 'queryA ENODATA')).code).toBe(StatusCheckCode.DnsNoRecord);
    expect(failureOf(coded('EAI_AGAIN', 'getaddrinfo EAI_AGAIN')).code).toBe(
      StatusCheckCode.DnsTemporary,
    );
    expect(failureOf(coded('ETIMEOUT', 'queryA ETIMEOUT')).code).toBe(
      StatusCheckCode.DnsTemporary,
    );
  });

  it('незнакомый отказ не остаётся без текста', () => {
    const failure = failureOf('строка вместо ошибки');

    expect(failure.code).toBe(StatusCheckCode.Unknown);
    expect(failure.raw).toBeNull();
    expect(failure.phrase.length).toBeGreaterThan(0);
  });

  it('незнакомый код показывается как есть', () => {
    // Выдумывать причину нельзя, а код — то единственное, с чем человек
    // пойдёт разбираться дальше.
    const failure = failureOf(coded('EMUDDLE', 'разладилось'));

    expect(failure.code).toBe(StatusCheckCode.Unknown);
    expect(failure.phrase).toContain('EMUDDLE');
  });
});

describe('httpFailureOf', () => {
  it('5xx — падение', () => {
    expect(httpFailureOf(502)).toMatchObject({ code: StatusCheckCode.ServerError, isDown: true });
  });

  it('401, 403, 405 и 501 — отвечает, с пометкой', () => {
    // Адрес за авторизацией и адрес, не принимающий GET, живы: будить
    // человека такой ответ не повод.
    expect(httpFailureOf(401)).toMatchObject({
      code: StatusCheckCode.AuthRequired,
      isDown: false,
    });
    expect(httpFailureOf(403).code).toBe(StatusCheckCode.AuthRequired);
    expect(httpFailureOf(405).code).toBe(StatusCheckCode.MethodNotAllowed);
    expect(httpFailureOf(501).code).toBe(StatusCheckCode.MethodNotAllowed);
    expect(httpFailureOf(501).isDown).toBe(false);
  });

  it('404 — настройка пути, а не падение', () => {
    expect(httpFailureOf(404)).toMatchObject({
      code: StatusCheckCode.PathNotFound,
      isDown: false,
    });
  });

  it('прочий 4xx — тоже не падение', () => {
    expect(httpFailureOf(429)).toMatchObject({
      code: StatusCheckCode.ClientError,
      isDown: false,
    });
  });

  it('фраза называет код ответа', () => {
    expect(httpFailureOf(502).phrase).toContain('502');
  });
});

describe('phraseOf', () => {
  it('у каждого кода есть русская фраза', () => {
    for (const code of Object.values(StatusCheckCode)) {
      expect(phraseOf(code, null)).not.toBe('');
    }
  });

  it('сырой код приписывается в скобках', () => {
    expect(phraseOf(StatusCheckCode.ConnectionRefused, 'ECONNREFUSED')).toBe(
      'соединение отвергнуто (ECONNREFUSED)',
    );
  });
});
