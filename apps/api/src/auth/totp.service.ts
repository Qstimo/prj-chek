import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';

import { CryptoService } from '../crypto/crypto.service';

/** Новый секрет второго фактора. */
export interface CreatedTotpSecret {
  /** Секрет в открытом виде. Показывается пользователю один раз и не хранится. */
  secret: string;
  /** Секрет для хранения в базе. */
  encryptedSecret: string;
  /** Ссылка для приложения-аутентификатора. */
  keyUri: string;
}

/**
 * Второй фактор аутентификации (спека 6.4).
 *
 * Секрет хранится только зашифрованным: при утечке базы одного пароля
 * по-прежнему недостаточно для входа.
 */
@Injectable()
export class TotpService {
  constructor(private readonly crypto: CryptoService) {}

  /** Создаёт секрет и ссылку для привязки приложения. */
  createSecret(email: string): CreatedTotpSecret {
    const secret = authenticator.generateSecret();

    return {
      secret,
      encryptedSecret: this.crypto.encrypt(secret),
      keyUri: authenticator.keyuri(email, ISSUER, secret),
    };
  }

  /**
   * Проверяет код.
   *
   * Возвращает `false`, если секрет не расшифровывается: смена ключа
   * шифрования должна выглядеть как неверный код, а не как отказ сервера.
   */
  verify(encryptedSecret: string, code: string): boolean {
    try {
      return authenticator.verify({ token: code, secret: this.crypto.decrypt(encryptedSecret) });
    } catch {
      return false;
    }
  }
}

/** Название системы в приложении-аутентификаторе. */
const ISSUER = 'CAIRN';
