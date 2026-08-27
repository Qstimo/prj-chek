import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';

/**
 * Достаёт субъект запроса, положенный {@link SessionGuard}.
 *
 * Использовать только на маршрутах под этим guard'ом: без него значение
 * будет пустым.
 */
export const CurrentSubject = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestSubject => {
    const request = context.switchToHttp().getRequest<{ subject?: RequestSubject }>();

    if (!request.subject) {
      throw new Error('Субъект запроса не найден: маршрут не защищён SessionGuard');
    }

    return request.subject;
  },
);
