import {
  AccessLevel,
  Section,
  roadmapCheckpointCreateSchema,
  roadmapCheckpointUpdateSchema,
  roadmapVersionCreateSchema,
  roadmapVersionUpdateSchema,
  type PublicLink,
  type PublicRoadmap,
  type RoadmapCheckpoint,
  type RoadmapCheckpointCreate,
  type RoadmapCheckpointUpdate,
  type RoadmapResponse,
  type RoadmapVersionCreate,
  type RoadmapVersionUpdate,
} from '@cairn/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { SuperadminGuard } from '../access/superadmin.guard';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RoadmapService } from './roadmap.service';

/** Секция «Роадмап» (спека 5). */
@Controller('projects/:projectId/roadmap')
@UseGuards(SessionGuard)
export class RoadmapController {
  constructor(
    private readonly roadmap: RoadmapService,
    private readonly access: AccessService,
  ) {}

  /** Роадмап проекта в проекции по уровню, со стадией. */
  @Get()
  async get(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<RoadmapResponse> {
    return this.roadmap.get(subject, projectId);
  }

  /** Создаёт версию в конце последовательности. */
  @Post('versions')
  async createVersion(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(roadmapVersionCreateSchema)) body: RoadmapVersionCreate,
  ) {
    const created = await this.roadmap.createVersion(subject, projectId, body);

    return { id: created.id, label: created.label, position: created.position };
  }

  /** Правит версию. */
  @Patch('versions/:versionId')
  async updateVersion(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body(new ZodValidationPipe(roadmapVersionUpdateSchema)) body: RoadmapVersionUpdate,
  ) {
    const updated = await this.roadmap.updateVersion(subject, projectId, versionId, body);

    return { id: updated.id, label: updated.label, position: updated.position };
  }

  /** Удаляет версию вместе с чекпоинтами. */
  @Delete('versions/:versionId')
  @HttpCode(204)
  async removeVersion(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ): Promise<void> {
    await this.roadmap.removeVersion(subject, projectId, versionId);
  }

  /** Создаёт чекпоинт. */
  @Post('versions/:versionId/checkpoints')
  async createCheckpoint(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body(new ZodValidationPipe(roadmapCheckpointCreateSchema)) body: RoadmapCheckpointCreate,
  ): Promise<RoadmapCheckpoint> {
    const created = await this.roadmap.createCheckpoint(subject, projectId, versionId, body);

    return {
      id: created.id,
      title: created.title,
      isDone: created.isDone,
      position: created.position,
    };
  }

  /** Правит чекпоинт: формулировку, признак, позицию. */
  @Patch('versions/:versionId/checkpoints/:checkpointId')
  async updateCheckpoint(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Param('checkpointId', ParseUUIDPipe) checkpointId: string,
    @Body(new ZodValidationPipe(roadmapCheckpointUpdateSchema)) body: RoadmapCheckpointUpdate,
  ): Promise<RoadmapCheckpoint> {
    const updated = await this.roadmap.updateCheckpoint(
      subject,
      projectId,
      versionId,
      checkpointId,
      body,
    );

    return {
      id: updated.id,
      title: updated.title,
      isDone: updated.isDone,
      position: updated.position,
    };
  }

  /** Удаляет чекпоинт. */
  @Delete('versions/:versionId/checkpoints/:checkpointId')
  @HttpCode(204)
  async removeCheckpoint(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Param('checkpointId', ParseUUIDPipe) checkpointId: string,
  ): Promise<void> {
    await this.roadmap.removeCheckpoint(subject, projectId, versionId, checkpointId);
  }

  /** Показывает ссылку читающим: им её и рассылать. */
  @Get('public-link')
  async findPublicLink(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<PublicLink> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Read);

    const token = await this.roadmap.findPublicLink(projectId);

    if (!token) {
      throw new NotFoundException('Роадмап не опубликован');
    }

    return linkForms(token);
  }

  /** Публикует роадмап. Раскрытие наружу — решение суперадмина. */
  @Post('public-link')
  @UseGuards(SessionGuard, SuperadminGuard)
  async publish(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<PublicLink> {
    return linkForms(await this.roadmap.publish(subject, projectId));
  }

  /** Отключает публикацию: прежняя ссылка гаснет. */
  @Delete('public-link')
  @HttpCode(204)
  @UseGuards(SessionGuard, SuperadminGuard)
  async unpublish(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<void> {
    await this.roadmap.unpublish(subject, projectId);
  }
}

/** Публичный роадмап: чтение по токену без сессии (ТЗ 3.5). */
@Controller('public/roadmap')
export class PublicRoadmapController {
  constructor(private readonly roadmap: RoadmapService) {}

  /** Роадмап по токену. Мусорный и отключённый неразличимы. */
  @Get(':token')
  async get(@Param('token') token: string): Promise<PublicRoadmap> {
    const roadmap = await this.roadmap.publicRoadmap(token);

    if (!roadmap) {
      throw new NotFoundException();
    }

    return roadmap;
  }
}

/** Ссылка в обеих формах: токен и готовый адрес страницы. */
function linkForms(token: string): PublicLink {
  const base = process.env.CAIRN_WEB_URL ?? 'http://localhost:3000';

  return { token, url: `${base}/roadmap/${token}` };
}
