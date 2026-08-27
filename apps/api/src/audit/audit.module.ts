import { forwardRef, Global, Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { AuditController } from './audit.controller';
import { AuditQueryService } from './audit-query.service';
import { AuditService } from './audit.service';

/**
 * Модуль журналирования.
 *
 * Глобальный: запись в журнал нужна почти всем модулям. Чтение вынесено
 * в отдельный сервис — оно требует подключения к базе, а запись работает
 * с транзакцией вызывающего.
 *
 * Связь с модулем аутентификации взаимная: `AuthModule` использует
 * `AuditService` для записи, а этот модуль — `SessionGuard` для защиты
 * контроллера чтения. Разрывается `forwardRef`.
 */
@Global()
@Module({
  imports: [DbModule, AccessModule, forwardRef(() => AuthModule)],
  controllers: [AuditController],
  providers: [AuditService, AuditQueryService],
  exports: [AuditService],
})
export class AuditModule {}
