import { describe, expect, it } from 'vitest';

import { loginSchema, totpSchema, totpVerifySchema } from './auth';

describe('loginSchema', () => {
  it('принимает корректные данные', () => {
    expect(loginSchema.safeParse({ email: 'user@cairn.local', password: 'пароль' }).success).toBe(
      true,
    );
  });

  it('приводит адрес к нижнему регистру', () => {
    // Иначе один и тот же человек считался бы разными пользователями.
    const result = loginSchema.parse({ email: 'User@Cairn.Local', password: 'пароль' });

    expect(result.email).toBe('user@cairn.local');
  });

  it('отвергает пустой пароль', () => {
    expect(loginSchema.safeParse({ email: 'user@cairn.local', password: '' }).success).toBe(false);
  });

  it('отвергает адрес без домена', () => {
    expect(loginSchema.safeParse({ email: 'не адрес', password: 'пароль' }).success).toBe(false);
  });
});

describe('totpSchema', () => {
  it('принимает шестизначный код', () => {
    expect(totpSchema.safeParse({ code: '123456' }).success).toBe(true);
  });

  it('отвергает код другой длины', () => {
    expect(totpSchema.safeParse({ code: '12345' }).success).toBe(false);
  });

  it('отвергает код с буквами', () => {
    expect(totpSchema.safeParse({ code: '12345a' }).success).toBe(false);
  });
});

describe('totpVerifySchema', () => {
  it('требует челлендж вместе с кодом', () => {
    expect(totpVerifySchema.safeParse({ code: '123456' }).success).toBe(false);
  });

  it('принимает челлендж и код вместе', () => {
    expect(
      totpVerifySchema.safeParse({ code: '123456', challengeToken: 'токен' }).success,
    ).toBe(true);
  });
});
