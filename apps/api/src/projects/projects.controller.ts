import {
  projectCreateSchema,
  projectUpdateSchema,
  type ProjectCreate,
  type ProjectDetail,
  type ProjectMetadata,
  type ProjectUpdate,
} from '@cairn/shared';
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProjectsService } from './projects.service';

/** Проекты и секция «Инфо» (спека 8). */
@Controller('projects')
@UseGuards(SessionGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  /** Список видимых проектов в проекции метаданных. */
  @Get()
  async list(@CurrentSubject() subject: RequestSubject): Promise<ProjectMetadata[]> {
    return this.projects.list(subject);
  }

  /** Карточка проекта в проекции, соответствующей уровню доступа. */
  @Get(':id')
  async findById(
    @CurrentSubject() subject: RequestSubject,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProjectMetadata | ProjectDetail> {
    return this.projects.findById(subject, id);
  }

  /**
   * Создаёт проект.
   *
   * Право проверяет репозиторий: guard суперадмина здесь неприменим, потому
   * что тот же контроллер обслуживает маршруты, доступные не только
   * администратору (спека 4.4).
   */
  @Post()
  async create(
    @CurrentSubject() subject: RequestSubject,
    @Body(new ZodValidationPipe(projectCreateSchema)) body: ProjectCreate,
  ): Promise<ProjectMetadata | ProjectDetail> {
    const created = await this.projects.create(subject, body);

    return this.projects.findById(subject, created.id);
  }

  /** Правит поля паспорта. Требует уровень записи. */
  @Patch(':id')
  async update(
    @CurrentSubject() subject: RequestSubject,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(projectUpdateSchema)) body: ProjectUpdate,
  ): Promise<ProjectMetadata | ProjectDetail> {
    await this.projects.update(subject, id, body);

    return this.projects.findById(subject, id);
  }
}
