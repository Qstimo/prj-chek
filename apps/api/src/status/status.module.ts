import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { ProjectStatusController, StatusController } from './status.controller';
import { StatusRepository } from './status.repository';
import { REAL_CHECKERS, STATUS_CHECKERS, StatusRunnerService } from './status-runner.service';
import { StatusService } from './status.service';

/** Модуль автопроверок статуса. */
@Module({
  imports: [DbModule, AccessModule, AuditModule, AuthModule],
  controllers: [ProjectStatusController, StatusController],
  providers: [
    StatusRepository,
    StatusRunnerService,
    StatusService,
    { provide: STATUS_CHECKERS, useValue: REAL_CHECKERS },
  ],
  exports: [StatusRepository, StatusService],
})
export class StatusModule {}
