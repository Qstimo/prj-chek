import { randomBytes } from 'node:crypto';

import { authenticator } from 'otplib';
import { beforeEach, describe, expect, it } from 'vitest';

import { CryptoService } from '../crypto/crypto.service';
import { TotpService } from './totp.service';

describe('TotpService', () => {
  let crypto: CryptoService;
  let service: TotpService;

  beforeEach(() => {
    crypto = new CryptoService(randomBytes(32).toString('base64'));
    service = new TotpService(crypto);
  });

  describe('создание секрета', () => {
    it('возвращает зашифрованный секрет', () => {
      const { encryptedSecret } = service.createSecret('user@cairn.local');

      // Секрет не должен храниться открытым: утечка базы не даёт второго фактора.
      expect(encryptedSecret.startsWith('v1:')).toBe(true);
    });

    it('возвращает ссылку для приложения-аутентификатора', () => {
      const { keyUri } = service.createSecret('user@cairn.local');

      expect(keyUri).toMatch(/^otpauth:\/\/totp\//);
      expect(keyUri).toContain('CAIRN');
    });

    it('даёт разные секреты при каждом вызове', () => {
      const first = service.createSecret('user@cairn.local');
      const second = service.createSecret('user@cairn.local');

      expect(first.encryptedSecret).not.toBe(second.encryptedSecret);
    });
  });

  describe('проверка кода', () => {
    it('принимает верный код', () => {
      const { encryptedSecret, secret } = service.createSecret('user@cairn.local');
      const code = authenticator.generate(secret);

      expect(service.verify(encryptedSecret, code)).toBe(true);
    });

    it('отвергает неверный код', () => {
      const { encryptedSecret } = service.createSecret('user@cairn.local');

      expect(service.verify(encryptedSecret, '000000')).toBe(false);
    });

    it('отвергает код от другого секрета', () => {
      const first = service.createSecret('user@cairn.local');
      const second = service.createSecret('other@cairn.local');
      const code = authenticator.generate(second.secret);

      expect(service.verify(first.encryptedSecret, code)).toBe(false);
    });

    it('возвращает false, если секрет не расшифровывается', () => {
      // Смена ключа шифрования не должна ронять вход пятисотой ошибкой.
      expect(service.verify('v1:aaaa:bbbb:cccc', '123456')).toBe(false);
    });
  });
});
