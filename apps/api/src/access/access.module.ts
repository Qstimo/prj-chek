import { Module } from '@nestjs/common';

import { AccessService } from './access.service';
import { SuperadminGuard } from './superadmin.guard';

/** Модуль модели доступа. */
@Module({
  providers: [AccessService, SuperadminGuard],
  exports: [AccessService, SuperadminGuard],
})
export class AccessModule {}
