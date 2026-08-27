import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

/** Хэширование и проверка паролей (спека 4.2). */
@Injectable()
export class PasswordService {
  /** Хэширует пароль. Соль генерируется на каждый вызов самим argon2. */
  async hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  /**
   * Проверяет пароль.
   *
   * Возвращает `false` при испорченном хэше, а не бросает исключение:
   * повреждённая запись в базе не должна превращать неудачный вход
   * в ошибку сервера, по которой отличают существующего пользователя.
   */
  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}
