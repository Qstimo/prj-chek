import { describe, expect, it } from 'vitest';

import { sessions } from './sessions';
import { totpChallenges } from './totp-challenges';

describe('сессии', () => {
  it('хранит только хэш токена', () => {
    // Сам токен известен лишь браузеру: утечка базы не должна давать входа.
    expect('token' in sessions).toBe(false);
    expect(sessions.tokenHash).toBeDefined();
  });

  it('содержит признак отзыва для немедленного завершения', () => {
    expect(sessions.revokedAt).toBeDefined();
  });
});

describe('челленджи второго фактора', () => {
  it('считает попытки', () => {
    // Пять неудачных попыток исчерпывают челлендж (спека 6.2).
    expect(totpChallenges.attempts).toBeDefined();
  });

  it('хранит только хэш токена', () => {
    expect('token' in totpChallenges).toBe(false);
  });
});
