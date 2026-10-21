import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { IncidentsController } from './incidents.controller';
import { IncidentsRepository } from './incidents.repository';
import { IncidentsService } from './incidents.service';

/** Модуль инцидентов адресов. */
@Module({
  imports: [DbModule, AccessModule, AuthModule],
  controllers: [IncidentsController],
  providers: [IncidentsRepository, IncidentsService],
  exports: [IncidentsRepository, IncidentsService],
})
export class IncidentsModule {}
