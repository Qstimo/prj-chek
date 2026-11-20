import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { TasksController } from './tasks.controller';
import { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';

/**
 * Модуль задач проекта.
 *
 * `AuthModule` обязателен: контроллер висит на `SessionGuard`.
 * Репозиторий экспортируется — он нужен конструктору саммари: релиз
 * черновика заводит задачи реестра, а не чекпоинты напрямую.
 */
@Module({
  imports: [DbModule, AccessModule, AuditModule, AuthModule],
  controllers: [TasksController],
  providers: [TasksRepository, TasksService],
  exports: [TasksRepository, TasksService],
})
export class TasksModule {}
