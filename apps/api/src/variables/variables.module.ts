import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CryptoModule } from '../crypto/crypto.module';
import { DbModule } from '../db/db.module';
import { VariablesController, VariablesEnvironmentsController } from './variables.controller';
import { VariablesRepository } from './variables.repository';
import { VariablesService } from './variables.service';

/** Модуль секции «Переменные». */
@Module({
  imports: [DbModule, AccessModule, AuditModule, AuthModule, CryptoModule],
  controllers: [VariablesController, VariablesEnvironmentsController],
  providers: [VariablesRepository, VariablesService],
  exports: [VariablesRepository, VariablesService],
})
export class VariablesModule {}
