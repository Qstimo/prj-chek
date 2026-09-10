import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { ServersController } from './servers.controller';
import { ServersRepository } from './servers.repository';
import { ServersService } from './servers.service';

/** Модуль реестра серверов. */
@Module({
  imports: [DbModule, AuthModule, AuditModule],
  controllers: [ServersController],
  providers: [ServersRepository, ServersService],
  exports: [ServersService],
})
export class ServersModule {}
