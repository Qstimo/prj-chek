import {
  platformCreateSchema,
  platformUpdateSchema,
  type Platform,
  type PlatformCreate,
  type PlatformUpdate,
} from '@cairn/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PlatformsService } from './platforms.service';

/** Платформы проекта: поле паспорта, секция «Инфо» (дизайн 9). */
@Controller('projects/:projectId/platforms')
@UseGuards(SessionGuard)
export class PlatformsController {
  constructor(private readonly platforms: PlatformsService) {}

  /** Платформы проекта по порядку. */
  @Get()
  async list(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<Platform[]> {
    return this.platforms.findForProject(subject, projectId);
  }

  /** Заводит платформу в конце списка. */
  @Post()
  async create(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(platformCreateSchema)) body: PlatformCreate,
  ): Promise<Platform> {
    const created = await this.platforms.create(subject, projectId, body);

    return {
      id: created.id,
      kind: created.kind,
      name: created.name,
      position: created.position,
    };
  }

  /** Правит имя платформы. */
  @Patch(':platformId')
  async update(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('platformId', ParseUUIDPipe) platformId: string,
    @Body(new ZodValidationPipe(platformUpdateSchema)) body: PlatformUpdate,
  ): Promise<Platform> {
    const updated = await this.platforms.update(subject, projectId, platformId, body);

    return {
      id: updated.id,
      kind: updated.kind,
      name: updated.name,
      position: updated.position,
    };
  }

  /** Удаляет платформу вместе с её выпусками, тегами и связями. */
  @Delete(':platformId')
  @HttpCode(204)
  async remove(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('platformId', ParseUUIDPipe) platformId: string,
  ): Promise<void> {
    await this.platforms.remove(subject, projectId, platformId);
  }
}
