import { describe, expect, it } from 'vitest';

import { ApiError, describeApiError, messageForStatus } from './errors';

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

describe('describeApiError', () => {
  it('называет поля, на которых споткнулась проверка', () => {
    // Бэкенд присылает разбор по полям, и терять его нельзя: без него
    // пользователь видит «проверьте поля» и гадает, какие именно.
    const error = new ApiError(400, 'Неверные данные запроса', {
      issues: [
        { path: 'healthCheckUrl', code: 'invalid_string', message: 'Invalid url' },
        { path: 'domains.0', code: 'custom', message: 'Ожидается домен' },
      ],
    });

    const text = describeApiError(error);

    expect(text).toContain('Адрес проверки');
    expect(text).toContain('ссылк');
    expect(text).toContain('Домены');
    expect(text).toContain('Ожидается домен');
  });

  it('оставляет общее сообщение, когда разбора нет', () => {
    expect(describeApiError(new ApiError(403, 'Недостаточно прав'))).toBe('Недостаточно прав');
  });

  it('понимает неизвестное поле, не теряя объяснения', () => {
    const error = new ApiError(400, 'Неверные данные запроса', {
      issues: [{ path: 'exoticField', code: 'too_big', message: 'Too big' }],
    });

    expect(describeApiError(error)).toContain('exoticField');
    expect(describeApiError(error)).toContain('длин');
  });

  it('переводит ошибку постороннего вида в текст как есть', () => {
    expect(describeApiError(new Error('сеть недоступна'))).toBe('сеть недоступна');
    expect(describeApiError(null)).toBeUndefined();
  });
});
