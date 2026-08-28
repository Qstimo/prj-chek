import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { ChronicleController } from './chronicle.controller';
import { ChronicleRepository } from './chronicle.repository';
import { ChronicleService } from './chronicle.service';

/** Модуль секции «Хроника». */
@Module({
  imports: [DbModule, AccessModule, AuditModule, AuthModule],
  controllers: [ChronicleController],
  providers: [ChronicleRepository, ChronicleService],
  exports: [ChronicleRepository, ChronicleService],
})
export class ChronicleModule {}
