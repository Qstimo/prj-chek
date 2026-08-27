import { describe, expect, it } from 'vitest';

import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('проверяет верный пароль', async () => {
    const hash = await service.hash('верный-пароль');

    expect(await service.verify(hash, 'верный-пароль')).toBe(true);
  });

  it('отвергает неверный пароль', async () => {
    const hash = await service.hash('верный-пароль');

    expect(await service.verify(hash, 'неверный-пароль')).toBe(false);
  });

  it('даёт разные хэши для одного пароля', async () => {
    // Соль генерируется на каждый вызов: одинаковые хэши выдали бы
    // совпадающие пароли разных пользователей.
    expect(await service.hash('пароль')).not.toBe(await service.hash('пароль'));
  });

  it('использует argon2id', async () => {
    expect(await service.hash('пароль')).toMatch(/^\$argon2id\$/);
  });

  it('работает с кириллицей и длинными паролями', async () => {
    const password = 'очень длинный пароль с пробелами и символами №1!';
    const hash = await service.hash(password);

    expect(await service.verify(hash, password)).toBe(true);
  });

  it('возвращает false на испорченном хэше вместо исключения', async () => {
    // Испорченный хэш в базе не должен ронять вход пятисотой ошибкой.
    expect(await service.verify('не хэш', 'пароль')).toBe(false);
  });
});
