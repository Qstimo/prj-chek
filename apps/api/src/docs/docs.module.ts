import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { DocsController } from './docs.controller';
import { DocsRepository } from './docs.repository';
import { DocsService } from './docs.service';

/** Модуль секции «Документация». */
@Module({
  imports: [DbModule, AccessModule, AuditModule, AuthModule],
  controllers: [DocsController],
  providers: [DocsRepository, DocsService],
  exports: [DocsRepository, DocsService],
})
export class DocsModule {}
