import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { ModelServiceTaskSuggesterSource } from '../summaries/suggester/task-suggester.source';
import { TASK_SUGGESTER_SOURCE } from '../summaries/suggester/task-suggester';
import { ModelServiceSettingsService } from './model-service-settings.service';
import { ModelServicesController } from './model-services.controller';
import { ModelServicesRepository } from './model-services.repository';
import { ModelServicesService } from './model-services.service';

/**
 * Модуль настройки служб модели.
 *
 * Наружу отдаёт службу разрешения и источник адаптера: репозиторий
 * остаётся внутри, потому что писать настройку вправе лишь свои ручки под
 * `SuperadminGuard`, а читать её потребителям нужно уже разрешённой — с
 * выбранным источником и расшифрованным ключом (дизайн, 5.2).
 *
 * Источник адаптера предложителя живёт **здесь**, а не в
 * `SummariesModule`, и это не вкус: проверка связи — ручка
 * администрирования, значит ей нужен порт, а `SummariesModule` и так
 * импортирует этот модуль. Регистрация источника там заставила бы модули
 * импортировать друг друга. Строится источник из одной только службы
 * разрешения, то есть принадлежит этой стороне по существу.
 *
 * `CryptoService` не импортируется: его модуль глобальный, и второго
 * механизма шифрования в системе не появляется.
 */
@Module({
  imports: [DbModule, AuditModule, AuthModule],
  controllers: [ModelServicesController],
  providers: [
    ModelServicesRepository,
    ModelServiceSettingsService,
    ModelServicesService,
    // За токеном стоит источник адаптера, а не адаптер: настройка
    // меняется на ходу, значит и адаптер строится на каждый вызов
    // (дизайн, 9.2).
    { provide: TASK_SUGGESTER_SOURCE, useClass: ModelServiceTaskSuggesterSource },
  ],
  exports: [ModelServiceSettingsService, TASK_SUGGESTER_SOURCE],
})
export class ModelServicesModule {}
