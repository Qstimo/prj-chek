import {
  summaryCreateSchema, summaryReleaseSchema, summaryTaskIdsSchema, summaryTasksReplaceSchema,
  type SummaryRelease, type SummaryTaskIds, type SummaryCreate, type SummaryDetail,
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

  @Post(':id/tasks/archive')
  @HttpCode(200)
  archiveTasks(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(summaryTaskIdsSchema)) body: SummaryTaskIds,
  ): Promise<SummaryDetail> {
    return this.summaries.archiveTasks(subject, projectId, id, body);
  }

  @Post(':id/tasks/restore')
  @HttpCode(200)
  restoreTasks(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(summaryTaskIdsSchema)) body: SummaryTaskIds,
  ): Promise<SummaryDetail> {
    return this.summaries.restoreTasks(subject, projectId, id, body);
  }

  @Post(':id/tasks/remove')
  @HttpCode(200)
  removeTasks(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(summaryTaskIdsSchema)) body: SummaryTaskIds,
  ): Promise<SummaryDetail> {
    return this.summaries.removeTasks(subject, projectId, id, body);
  }

  /** Версия валидируется общей схемой: путь записи роадмапа остаётся единым. */
  @Post(':id/tasks/release')
  release(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(summaryReleaseSchema)) body: SummaryRelease,
  ): Promise<SummaryReleaseResult> {
    return this.summaries.release(subject, projectId, id, body);
  }
}
