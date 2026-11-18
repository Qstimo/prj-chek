import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ChronicleModule } from '../chronicle/chronicle.module';
import { DbModule } from '../db/db.module';
import { ModelServicesModule } from '../model-services/model-services.module';
import { RoadmapModule } from '../roadmap/roadmap.module';
import { SummariesController } from './summaries.controller';
import { SummariesOverviewController } from './summaries-overview.controller';
import { SummariesRepository } from './summaries.repository';
import { SummariesService } from './summaries.service';
import { RecordingStore } from './transcription/recording-store';

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
  providers: [SummariesRepository, SummariesService, RecordingStore],
  // Источник адаптера приходит из `ModelServicesModule`: он строится из
  // одной только службы разрешения настройки, и проверка связи на экране
  // администрирования нуждается в том же источнике. Две регистрации одного
  // токена разошлись бы при первой правке фабрики.
  exports: [SummariesRepository, SummariesService],
})
export class SummariesModule {}
