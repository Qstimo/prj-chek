import { describe, expect, it } from 'vitest';

import { generateToken, hashToken } from './token';

describe('generateToken', () => {
  it('даёт разные токены', () => {
    expect(generateToken()).not.toBe(generateToken());
  });

  it('годится для передачи в cookie и ссылке', () => {
    // base64url без символов, требующих экранирования в URL.
    expect(generateToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('содержит не меньше 32 байт энтропии', () => {
    expect(generateToken().length).toBeGreaterThanOrEqual(43);
  });
});

describe('hashToken', () => {
  it('даёт одинаковый хэш для одного токена', () => {
    const token = generateToken();

    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('даёт разные хэши для разных токенов', () => {
    expect(hashToken(generateToken())).not.toBe(hashToken(generateToken()));
  });

  it('не содержит исходный токен', () => {
    const token = generateToken();

    expect(hashToken(token)).not.toContain(token);
  });
});
