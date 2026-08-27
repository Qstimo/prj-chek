import { createHash, randomBytes } from 'node:crypto';

/**
 * Создаёт случайный токен для сессии или одноразовой ссылки.
 *
 * Кодировка base64url: токен попадает и в cookie, и в адрес ссылки,
 * а значит не должен требовать экранирования.
 */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * Хэширует токен для хранения в базе.
 *
 * Используется sha256, а не argon2: токен случаен и достаточно длинен,
 * перебирать его нечем, а argon2 на каждом запросе стоил бы сотни
 * миллисекунд. Медленный хэш нужен паролям, которые люди выбирают сами.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Длина токена в байтах до кодирования. */
const TOKEN_BYTES = 32;
