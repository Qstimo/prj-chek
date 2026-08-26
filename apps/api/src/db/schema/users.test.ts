import { describe, expect, it } from 'vitest';

import { users } from './users';

describe('пользователи', () => {
  it('не содержит поля статуса', () => {
    // Активность определяется через subjects.revokedAt — единственный источник истины (спека 4.2).
    expect('status' in users).toBe(false);
  });

  it('хранит секрет второго фактора в зашифрованном виде', () => {
    expect(users.totpSecretEncrypted).toBeDefined();
  });

  it('допускает отсутствие пароля', () => {
    // Состояние «нет действующего пароля»: приглашён либо пароль сброшен (спека 4.2).
    expect(users.passwordHash.notNull).toBe(false);
  });
});
