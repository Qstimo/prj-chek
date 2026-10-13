import { describe, expect, it } from 'vitest';

import { inviteUserSchema, userUpdateSchema } from './user';

describe('приглашение', () => {
  it('требует имя', () => {
    // Имя обязательно: без него карточке нечего показывать, кроме логина.
    expect(inviteUserSchema.safeParse({ email: 'anna@example.com' }).success).toBe(false);
  });

  it('обрезает имя по краям и приводит почту к нижнему регистру', () => {
    const parsed = inviteUserSchema.parse({ name: '  Анна  ', email: 'Anna@Example.COM' });

    expect(parsed).toEqual({ name: 'Анна', email: 'anna@example.com' });
  });
});

describe('правка учётки', () => {
  it('принимает одно поле', () => {
    expect(userUpdateSchema.parse({ name: 'Анна' })).toEqual({ name: 'Анна' });
  });

  it('отвергает пустую правку', () => {
    // Запрос без изменений завершился бы успехом, ничего не изменив.
    expect(userUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('отвергает пустое имя', () => {
    expect(userUpdateSchema.safeParse({ name: '   ' }).success).toBe(false);
  });
});
