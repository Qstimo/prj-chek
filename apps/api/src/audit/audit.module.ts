import { Global, Module } from '@nestjs/common';

import { AuditService } from './audit.service';

/** Модуль журналирования. Глобальный: журнал пишут почти все модули. */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
