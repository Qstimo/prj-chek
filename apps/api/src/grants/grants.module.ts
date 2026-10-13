import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { UsersModule } from '../users/users.module';
import { GrantsController } from './grants.controller';
import { GrantsRepository } from './grants.repository';
import { GrantsService } from './grants.service';
import { UserGrantsController } from './user-grants.controller';

/**
 * Модуль выдач доступа.
 *
 * Зависит от модуля пользователей: выдачи адресуются субъектом, а срез
 * по человеку приходит с идентификатором его учётки. Цикла нет — модуль
 * пользователей о выдачах не знает.
 */
@Module({
  imports: [DbModule, AccessModule, AuditModule, AuthModule, UsersModule],
  controllers: [GrantsController, UserGrantsController],
  providers: [GrantsRepository, GrantsService],
  exports: [GrantsRepository, GrantsService],
})
export class GrantsModule {}
