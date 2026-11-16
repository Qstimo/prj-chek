import {
  roadmapVersionCreateSchema, summaryCreateSchema, summaryTasksReplaceSchema,
  type RoadmapVersionCreate, type SummaryCreate, type SummaryDetail,
  type SummaryListItem, type SummaryReleaseResult, type SummaryTasksReplace,
} from '@cairn/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SummariesService } from './summaries.service';

/** Права остаются в выборке репозитория: guard защищает только сессию. */
@Controller('projects/:projectId/summaries')
@UseGuards(SessionGuard)
export class SummariesController {
  constructor(private readonly summaries: SummariesService) {}

  /** История саммари проекта. */
  @Get()
  list(@CurrentSubject() subject: RequestSubject, @Param('projectId', ParseUUIDPipe) projectId: string): Promise<SummaryListItem[]> {
    return this.summaries.list(subject, projectId);
  }

  /** Сохраняет текст в хронике и создаёт саммари. */
  @Post()
  create(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(summaryCreateSchema)) body: SummaryCreate,
  ): Promise<SummaryDetail> {
    return this.summaries.create(subject, projectId, body);
  }

  /** Деталь саммари с черновиком. */
  @Get(':id')
  findById(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SummaryDetail> {
    return this.summaries.findById(subject, projectId, id);
  }

  /** Удаляет саммари, сохраняя запись хроники. */
  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.summaries.remove(subject, projectId, id);
  }

  /** Вызов предложителя возвращает обновлённую деталь. */
  @Post(':id/tasks/suggest')
  @HttpCode(200)
  suggest(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SummaryDetail> {
    return this.summaries.suggest(subject, projectId, id);
  }

  /** Полная замена черновика. */
  @Put(':id/tasks')
  replaceTasks(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(summaryTasksReplaceSchema)) body: SummaryTasksReplace,
  ): Promise<SummaryDetail> {
    return this.summaries.replaceTasks(subject, projectId, id, body);
  }

  /** Версия валидируется общей схемой: путь записи роадмапа остаётся единым. */
  @Post(':id/release')
  release(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(roadmapVersionCreateSchema)) body: RoadmapVersionCreate,
  ): Promise<SummaryReleaseResult> {
    return this.summaries.release(subject, projectId, id, body);
  }
}
