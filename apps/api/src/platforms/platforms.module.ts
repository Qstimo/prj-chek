import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { PlatformsController } from './platforms.controller';
import { PlatformsRepository } from './platforms.repository';
import { PlatformsService } from './platforms.service';

/**
 * Модуль платформ проекта.
 *
 * `AuthModule` обязателен: контроллер висит на `SessionGuard`.
 * Репозиторий экспортируется — он нужен модулям проектов (платформы
 * заводятся вместе с проектом) и окружений (связи «что здесь развёрнуто»).
 */
@Module({
  imports: [DbModule, AccessModule, AuditModule, AuthModule],
  controllers: [PlatformsController],
  providers: [PlatformsRepository, PlatformsService],
  exports: [PlatformsRepository, PlatformsService],
})
export class PlatformsModule {}
