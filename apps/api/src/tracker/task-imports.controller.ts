import {
  trackerImportQuerySchema,
  trackerImportRequestSchema,
  type TrackerImportQuery,
  type TrackerImportRequest,
} from '@cairn/shared';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TaskImportsService } from './task-imports.service';

@Controller('projects/:projectId/tasks/import')
@UseGuards(SessionGuard)
export class TaskImportsController {
  constructor(private readonly imports: TaskImportsService) {}

  @Get()
  preview(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query(new ZodValidationPipe(trackerImportQuerySchema)) query: TrackerImportQuery,
  ) {
    return this.imports.preview(subject, projectId, query);
  }

  @Post()
  import(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(trackerImportRequestSchema)) input: TrackerImportRequest,
  ) {
    return this.imports.import(subject, projectId, input);
  }
}
