import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { GrantsController } from './grants.controller';
import { GrantsRepository } from './grants.repository';
import { GrantsService } from './grants.service';

/** Модуль выдач доступа. */
@Module({
  imports: [DbModule, AccessModule, AuditModule, AuthModule],
  controllers: [GrantsController],
  providers: [GrantsRepository, GrantsService],
  exports: [GrantsRepository, GrantsService],
})
export class GrantsModule {}
