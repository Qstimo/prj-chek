import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ChronicleModule } from '../chronicle/chronicle.module';
import { DbModule } from '../db/db.module';
import { RoadmapModule } from '../roadmap/roadmap.module';
import { DisabledSuggester } from './suggester/disabled.suggester';
import { OpenAiCompatibleSuggester } from './suggester/openai-compatible.suggester';
import { suggesterSettings } from './suggester/settings';
import { TASK_SUGGESTER, type TaskSuggester } from './suggester/task-suggester';
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
  imports: [DbModule, AccessModule, AuditModule, AuthModule, ChronicleModule, RoadmapModule],
  controllers: [SummariesController, SummariesOverviewController],
  providers: [
    SummariesRepository,
    SummariesService,
    {
      provide: TASK_SUGGESTER,
      useFactory: (): TaskSuggester => {
        const settings = suggesterSettings();

        // Порт выбирается один раз при старте: подмена адаптера на ходу
        // сменила бы границу передачи данных молча. Автоматического
        // перехода на внешний адаптер при отказе локального нет и не
        // будет — это запрет, а не недоработка (дизайн, раздел 5.2).
        return settings.isEnabled
          ? new OpenAiCompatibleSuggester(settings)
          : new DisabledSuggester();
      },
    },
  ],
  exports: [SummariesRepository, SummariesService, TASK_SUGGESTER],
})
export class SummariesModule {}
