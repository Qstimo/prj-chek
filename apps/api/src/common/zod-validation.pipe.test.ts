import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({
  email: z.string().email(),
  age: z.number().int().positive(),
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema);

  it('пропускает корректные данные', () => {
    expect(pipe.transform({ email: 'user@cairn.local', age: 30 })).toEqual({
      email: 'user@cairn.local',
      age: 30,
    });
  });

  it('отвергает данные, не прошедшие схему', () => {
    expect(() => pipe.transform({ email: 'не адрес', age: 30 })).toThrow(BadRequestException);
  });

  it('отбрасывает лишние поля', () => {
    // Иначе неизвестное поле дошло бы до слоя данных и могло попасть в базу.
    expect(pipe.transform({ email: 'user@cairn.local', age: 30, isSuperadmin: true })).toEqual({
      email: 'user@cairn.local',
      age: 30,
    });
  });

  it('сообщает, какое поле не прошло', () => {
    try {
      pipe.transform({ email: 'не адрес', age: 30 });
      expect.unreachable('ожидалось исключение');
    } catch (error) {
      expect(JSON.stringify(error)).toContain('email');
    }
  });

  it('называет вид ошибки, а не только текст zod', () => {
    // Тексты zod английские; по виду интерфейс подбирает русскую
    // формулировку, поэтому вид обязан доехать до клиента.
    try {
      pipe.transform({ email: 'не адрес', age: -1 });
      expect.unreachable('ожидалось исключение');
    } catch (error) {
      const { issues } = (error as BadRequestException).getResponse() as {
        issues: { path: string; code: string; message: string }[];
      };

      expect(issues).toHaveLength(2);
      expect(issues[0]).toMatchObject({ path: 'email', code: 'invalid_string' });
      expect(issues[1]).toMatchObject({ path: 'age', code: 'too_small' });
    }
  });

  it('отвергает значение, не являющееся объектом', () => {
    expect(() => pipe.transform('строка')).toThrow(BadRequestException);
  });
});
