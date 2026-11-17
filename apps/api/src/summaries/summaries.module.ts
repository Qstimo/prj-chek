import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ChronicleModule } from '../chronicle/chronicle.module';
import { DbModule } from '../db/db.module';
import { ModelServicesModule } from '../model-services/model-services.module';
import { RoadmapModule } from '../roadmap/roadmap.module';
import { ModelServiceTaskSuggesterSource } from './suggester/task-suggester.source';
import { TASK_SUGGESTER_SOURCE } from './suggester/task-suggester';
import { SummariesController } from './summaries.controller';
import { SummariesOverviewController } from './summaries-overview.controller';
import { SummariesRepository } from './summaries.repository';
import { SummariesService } from './summaries.service';

/**
 * Модуль конструктора задач из саммари созвона.
 *
 * Хронику и роадмап не трогает, а пользуется их репозиториями: текст
 * живёт записью хроники, а результат уезжает в роадмап штатным путём.
 */
@Module({
  imports: [
    DbModule,
    AccessModule,
    AuditModule,
    AuthModule,
    ChronicleModule,
    RoadmapModule,
    ModelServicesModule,
  ],
  controllers: [SummariesController, SummariesOverviewController],
  providers: [
    SummariesRepository,
    SummariesService,
    // За токеном стоит источник адаптера, а не адаптер: настройка
    // меняется на ходу, значит и адаптер строится на каждый вызов
    // (дизайн, 9.2). Прежняя фабрика строила его один раз при старте, и
    // правка настройки не действовала до перезапуска.
    { provide: TASK_SUGGESTER_SOURCE, useClass: ModelServiceTaskSuggesterSource },
  ],
  exports: [SummariesRepository, SummariesService, TASK_SUGGESTER_SOURCE],
})
export class SummariesModule {}
