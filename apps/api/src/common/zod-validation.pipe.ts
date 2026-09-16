import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Проверяет тело запроса схемой из пакета контракта.
 *
 * Схема одна и та же на бэкенде и во фронтенде, поэтому расхождение
 * проверок между ними невозможно по построению.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        message: 'Неверные данные запроса',
        // Вид ошибки (`code`) уезжает вместе с текстом: тексты zod английские,
        // и по виду интерфейс подбирает формулировку на языке системы.
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.code,
          message: issue.message,
        })),
      });
    }

    return result.data;
  }
}
