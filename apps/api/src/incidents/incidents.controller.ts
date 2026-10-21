import type { ProjectIncidents } from '@cairn/shared';
import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { IncidentsRepository } from './incidents.repository';

/** История падений адресов: часть секции «Инфраструктура» (ТЗ 4.3). */
@Controller('projects/:projectId/incidents')
@UseGuards(SessionGuard)
export class IncidentsController {
  constructor(private readonly incidents: IncidentsRepository) {}

  /** Инциденты адресов проекта. Уровень — метаданные инфраструктуры. */
  @Get()
  async list(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<ProjectIncidents> {
    return this.incidents.forProject(subject, projectId);
  }
}
