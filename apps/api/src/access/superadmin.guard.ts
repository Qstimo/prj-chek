import { CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import type { RequestSubject } from './access.types';

/**
 * Пропускает только суперадмина.
 *
 * Управление системой доступа, пользователями и журналом лежит вне сервиса
 * прав: оно не зависит ни от проекта, ни от секции (спека 8).
 *
 * Отказ — `403`, а не `404`: правило нераскрытия защищает сведения о том,
 * какие проекты существуют, а существование раздела администрирования
 * секретом не является.
 */
@Injectable()
export class SuperadminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ subject?: RequestSubject }>();
    const subject = request.subject;

    if (!subject || subject.isRevoked || !subject.isSuperadmin) {
      throw new ForbiddenException('Требуются права суперадминистратора');
    }

    return true;
  }
}
