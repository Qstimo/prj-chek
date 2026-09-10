import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { DomainsController } from './domains.controller';
import { DomainsRepository } from './domains.repository';
import { DomainsService } from './domains.service';

/**
 * Модуль реестра доменов.
 *
 * Репозиторий экспортируется: окружения зовут `ensureRoot`, когда подрядчик
 * вписывает домен, — иначе корень пришлось бы заводить руками заранее.
 */
@Module({
  imports: [DbModule, AuthModule, AuditModule],
  controllers: [DomainsController],
  providers: [DomainsRepository, DomainsService],
  exports: [DomainsRepository, DomainsService],
})
export class DomainsModule {}
