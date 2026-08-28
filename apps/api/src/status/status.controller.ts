import type { ProjectStatus, StatusSummaryRow } from '@cairn/shared';
import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { SuperadminGuard } from '../access/superadmin.guard';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { StatusService } from './status.service';

/** Статус проекта: часть секции «Инфраструктура» (ТЗ 4.3). */
@Controller('projects/:projectId/status')
@UseGuards(SessionGuard)
export class ProjectStatusController {
  constructor(private readonly status: StatusService) {}

  /** Агрегированный статус проекта. Уровень — метаданные инфраструктуры. */
  @Get()
  async get(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<ProjectStatus> {
    return this.status.projectStatus(subject, projectId);
  }
}

/** Сводка статусов и ручной запуск проверок. */
@Controller('status')
@UseGuards(SessionGuard)
export class StatusController {
  constructor(private readonly status: StatusService) {}

  /** Индикаторы и предупреждения по видимым проектам. */
  @Get('summary')
  async summary(@CurrentSubject() subject: RequestSubject): Promise<StatusSummaryRow[]> {
    return this.status.summary(subject);
  }

  /** Запускает все проверки сейчас. Право суперадмина, след в журнале. */
  @Post('run')
  @HttpCode(202)
  @UseGuards(SessionGuard, SuperadminGuard)
  async run(@CurrentSubject() subject: RequestSubject): Promise<{ ok: true }> {
    await this.status.runNow(subject);

    return { ok: true };
  }
}
