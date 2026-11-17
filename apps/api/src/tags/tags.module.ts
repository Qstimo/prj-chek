import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { ProjectTagsController, TagsController } from './tags.controller';
import { TagsRepository } from './tags.repository';
import { TagsService } from './tags.service';

/**
 * Модуль тегов проектов.
 *
 * `AuthModule` обязателен: контроллеры висят на `SessionGuard`.
 * Репозиторий экспортируется — он нужен модулю проектов: теги уходят
 * в сводку и в паспорт, и заводятся вместе с проектом.
 */
@Module({
  imports: [DbModule, AccessModule, AuditModule, AuthModule],
  controllers: [TagsController, ProjectTagsController],
  providers: [TagsRepository, TagsService],
  exports: [TagsRepository, TagsService],
})
export class TagsModule {}
