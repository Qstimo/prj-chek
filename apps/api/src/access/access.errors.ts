import { ForbiddenException, NotFoundException } from '@nestjs/common';

/**
 * Доступа к секции нет вовсе.
 *
 * Отвечаем `404`, а не `403`: ответ `403` сообщил бы, что объект существует,
 * а ТЗ 4.2 требует не раскрывать даже сам факт его существования.
 */
export class SectionNotVisibleError extends NotFoundException {
  constructor() {
    super('Не найдено');
  }
}

/**
 * Доступ есть, но его уровень ниже требуемого для операции.
 *
 * Здесь уместен `403`: отрицать существование объекта, который субъект
 * только что видел, бессмысленно (спека 5.3).
 */
export class InsufficientLevelError extends ForbiddenException {
  constructor() {
    super('Недостаточно прав для этого действия');
  }
}
