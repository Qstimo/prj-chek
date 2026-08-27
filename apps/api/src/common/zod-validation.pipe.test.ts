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

  it('отвергает значение, не являющееся объектом', () => {
    expect(() => pipe.transform('строка')).toThrow(BadRequestException);
  });
});
