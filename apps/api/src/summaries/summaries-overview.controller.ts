import type { ProjectMetadata, SummaryListItem, TaskSuggesterInfo } from '@cairn/shared';
import { Controller, Get, UseGuards } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { SummariesService } from './summaries.service';

/** Общий вход в поток: пустая выборка не раскрывает чужие проекты. */
@Controller('summaries')
@UseGuards(SessionGuard)
export class SummariesOverviewController {
  constructor(private readonly summaries: SummariesService) {}

  /** Саммари доступных для записи проектов. */
  @Get()
  list(@CurrentSubject() subject: RequestSubject): Promise<SummaryListItem[]> {
    return this.summaries.overview(subject);
  }

  /** Цели выбора для создания саммари. */
  @Get('projects')
  projects(@CurrentSubject() subject: RequestSubject): Promise<ProjectMetadata[]> {
    return this.summaries.writableProjects(subject);
  }

  /**
   * Только публичные настройки, доступные любому вошедшему.
   *
   * Асинхронна вместе со службой: читается действующая настройка, а не
   * снимок старта процесса.
   */
  @Get('suggester')
  suggester(): Promise<TaskSuggesterInfo> {
    return this.summaries.suggesterInfo();
  }
}
