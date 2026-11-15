import { Catch, type ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

import { httpErrorOf } from './postgres-error';

/**
 * Подстраховка на ошибках базы.
 *
 * Ограничения живут в двух местах: репозиторий проверяет повтор до вставки
 * и отвечает `409`, а база держит уникальный индекс как последнее слово.
 * Пока обе половины на месте, сюда ничего не доходит; когда новый репозиторий
 * забудет проверку, человек получит внятный `409` вместо `500`.
 */
@Catch()
export class PostgresExceptionFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    super.catch(httpErrorOf(exception) ?? exception, host);
  }
}
