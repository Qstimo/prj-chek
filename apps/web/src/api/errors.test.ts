import { describe, expect, it } from 'vitest';

import { ApiError, messageForStatus } from './errors';

describe('ApiError', () => {
  it('хранит код ответа', () => {
    expect(new ApiError(403, 'Нет прав').status).toBe(403);
  });
});

describe('messageForStatus', () => {
  it('объясняет 401 как истёкший вход', () => {
    expect(messageForStatus(401)).toMatch(/вой/i);
  });

  it('объясняет 403 как нехватку прав', () => {
    expect(messageForStatus(403)).toMatch(/прав/i);
  });

  it('объясняет 404 нейтрально', () => {
    // Формулировка не должна намекать, что объект существует, но закрыт:
    // это раскрыло бы его существование (ТЗ 4.2).
    const message = messageForStatus(404);

    expect(message).toMatch(/не найден/i);
    expect(message).not.toMatch(/доступ|прав/i);
  });

  it('для прочих кодов даёт общее сообщение', () => {
    expect(messageForStatus(500)).toBeTruthy();
  });
});
