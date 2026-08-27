import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { argon2id, argon2Verify } from 'hash-wasm';

/**
 * Хэширование и проверка паролей (спека 4.2).
 *
 * Используется argon2id — устойчивый и к перебору по словарю, и к атакам
 * с побочными каналами.
 *
 * Реализация взята на WebAssembly, а не нативная: нативная требует
 * компилятора при установке и завязана на сборку Node, из-за чего один и тот
 * же лок-файл даёт рабочую систему на одной машине и падение при первом
 * входе на другой. Для системы, где пароль — единственный барьер до второго
 * фактора, предсказуемость установки важнее нескольких миллисекунд.
 */
@Injectable()
export class PasswordService {
  /** Хэширует пароль. Соль генерируется на каждый вызов. */
  async hash(password: string): Promise<string> {
    return argon2id({
      password,
      salt: randomBytes(SALT_LENGTH),
      parallelism: PARALLELISM,
      iterations: ITERATIONS,
      memorySize: MEMORY_SIZE_KIB,
      hashLength: HASH_LENGTH,
      outputType: 'encoded',
    });
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
      return await argon2Verify({ password, hash });
    } catch {
      return false;
    }
  }
}

/** Длина соли в байтах. */
const SALT_LENGTH = 16;

/** Число потоков. */
const PARALLELISM = 1;

/** Число проходов. */
const ITERATIONS = 3;

/** Расход памяти в килобайтах — 64 МиБ. */
const MEMORY_SIZE_KIB = 65_536;

/** Длина хэша в байтах. */
const HASH_LENGTH = 32;
