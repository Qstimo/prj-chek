import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { DbModule } from '../db/db.module';
import { IncidentsRepository } from './incidents.repository';
import { IncidentsService } from './incidents.service';

/** Модуль инцидентов адресов. */
@Module({
  imports: [DbModule, AccessModule],
  providers: [IncidentsRepository, IncidentsService],
  exports: [IncidentsRepository, IncidentsService],
})
export class IncidentsModule {}
