import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { PushModule } from '../push/push.module';
import { PushNotifier } from '../push/push.notifier';
import { ServersModule } from '../servers/servers.module';
import { INCIDENT_NOTIFIER } from './notifier';
import { ProjectStatusController, StatusController } from './status.controller';
import { StatusRepository } from './status.repository';
import { REAL_CHECKERS, STATUS_CHECKERS, StatusRunnerService } from './status-runner.service';
import { StatusService } from './status.service';

/** Модуль автопроверок статуса. */
@Module({
  imports: [DbModule, AccessModule, AuditModule, AuthModule, ServersModule, IncidentsModule, PushModule],
  controllers: [ProjectStatusController, StatusController],
  providers: [
    StatusRepository,
    StatusRunnerService,
    StatusService,
    { provide: STATUS_CHECKERS, useValue: REAL_CHECKERS },
    // Прогон знает только интерфейс: чем уведомляют, решает этот
    // поставщик, и второй канал станет вторым поставщиком токена.
    { provide: INCIDENT_NOTIFIER, useExisting: PushNotifier },
  ],
  exports: [StatusRepository, StatusService],
})
export class StatusModule {}
