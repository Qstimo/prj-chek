import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { httpErrorOf } from './postgres-error';

/** Ошибка драйвера postgres.js: код SQLSTATE и имя ограничения. */
function pgError(code: string, constraint?: string): Error {
  return Object.assign(new Error('ошибка драйвера'), {
    code,
    ...(constraint ? { constraint_name: constraint } : {}),
  });
}

describe('перевод ошибок PostgreSQL в ответы API', () => {
  it('повтор по известному ограничению даёт 409 с внятным текстом', () => {
    const translated = httpErrorOf(pgError('23505', 'variables_environment_key'));

    expect(translated).toBeInstanceOf(ConflictException);
    expect(translated?.getResponse()).toMatchObject({
      message: 'Переменная с таким ключом уже есть в окружении.',
    });
  });

  it.each([
    ['environments_project_name', 'Окружение с таким названием уже есть в проекте.'],
    ['doc_pages_project_title', 'Страница с таким заголовком уже есть в проекте.'],
    ['project_platforms_project_name', 'Платформа с таким именем уже есть в проекте.'],
  ])('знает ограничение %s', (constraint, message) => {
    expect(httpErrorOf(pgError('23505', constraint))?.getResponse()).toMatchObject({ message });
  });

  it('повтор по незнакомому ограничению всё равно даёт 409, а не 500', () => {
    const translated = httpErrorOf(pgError('23505', 'какое_то_новое_ограничение'));

    expect(translated).toBeInstanceOf(ConflictException);
  });

  it.each(['22008', '22001', '22P02'])('негодное значение %s даёт 400', (code) => {
    expect(httpErrorOf(pgError(code))).toBeInstanceOf(BadRequestException);
  });

  it('не трогает ошибки, уже ставшие ответом API', () => {
    const original = new NotFoundException();

    expect(httpErrorOf(original)).toBeNull();
  });

  it('не трогает обычную ошибку: падение должно остаться падением', () => {
    expect(httpErrorOf(new Error('что-то пошло не так'))).toBeNull();
    expect(httpErrorOf(pgError('42703'))).toBeNull();
  });
});
