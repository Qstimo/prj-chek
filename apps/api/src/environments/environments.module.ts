import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { PlatformsModule } from '../platforms/platforms.module';
import { DomainsModule } from '../domains/domains.module';
import { EnvironmentsController } from './environments.controller';
import { EnvironmentsRepository } from './environments.repository';
import { EnvironmentsService } from './environments.service';

/** Модуль секции «Инфраструктура». */
@Module({
  imports: [DbModule, AccessModule, AuditModule, AuthModule, DomainsModule, PlatformsModule],
  controllers: [EnvironmentsController],
  providers: [EnvironmentsRepository, EnvironmentsService],
  exports: [EnvironmentsRepository, EnvironmentsService],
})
export class EnvironmentsModule {}
