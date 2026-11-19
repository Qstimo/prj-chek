import type {
  ProjectMetadata,
  SummaryListItem,
  TaskSuggesterInfo,
  TranscriberInfo,
  TranscriptionJob,
} from '@cairn/shared';
import { Controller, Get, UseGuards } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { SummariesService } from './summaries.service';
import { TranscriptionService } from './transcription/transcription.service';

/** Общий вход в поток: пустая выборка не раскрывает чужие проекты. */
@Controller('summaries')
@UseGuards(SessionGuard)
export class SummariesOverviewController {
  constructor(
    private readonly summaries: SummariesService,
    private readonly transcriptions: TranscriptionService,
  ) {}

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

  /**
   * Настройки расшифровки: доступны любому вошедшему.
   *
   * Это настройка **установки**, а не данные проекта, — ровно так же
   * устроена `/summaries/suggester`. Экрану она нужна, чтобы сказать правду
   * **до** загрузки: куда уйдёт запись и что из неё уйдёт (дизайн, 9.2).
   */
  @Get('transcriber')
  transcriber(): Promise<TranscriberInfo> {
    return this.transcriptions.transcriberInfo();
  }

  /**
   * Очередь расшифровок по всем проектам, куда можно писать хронику.
   *
   * Фильтрует существующая `AccessService.projectIdsWithLevel` — та самая,
   * которую завела первая итерация. Новой функции доступа не появилось, а
   * пустой список — законный ответ, и он ничего не раскрывает.
   */
  @Get('transcriptions')
  transcriptions_(@CurrentSubject() subject: RequestSubject): Promise<TranscriptionJob[]> {
    return this.transcriptions.overview(subject);
  }
}
