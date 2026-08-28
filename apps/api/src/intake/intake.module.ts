import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ChronicleModule } from '../chronicle/chronicle.module';
import { DbModule } from '../db/db.module';
import { IntakeAddressController, IntakeController } from './intake.controller';
import { IntakeService } from './intake.service';

/** Модуль приёмного канала. */
@Module({
  imports: [DbModule, AccessModule, AuditModule, AuthModule, ChronicleModule],
  controllers: [IntakeAddressController, IntakeController],
  providers: [IntakeService],
  exports: [IntakeService],
})
export class IntakeModule {}
