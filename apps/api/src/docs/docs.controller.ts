import {
  docPageCreateSchema,
  docPageUpdateSchema,
  type DocPageCreate,
  type DocPageDetail,
  type DocPageMetadata,
  type DocPageUpdate,
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
import { DocsService } from './docs.service';

/** Секция «Документация» (спека 4). Уровень проверяет репозиторий. */
@Controller('projects/:projectId/docs')
@UseGuards(SessionGuard)
export class DocsController {
  constructor(private readonly docs: DocsService) {}

  /** Список страниц в проекции по уровню. */
  @Get()
  async list(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<(DocPageMetadata | DocPageDetail)[]> {
    return this.docs.list(subject, projectId);
  }

  /** Одна страница в проекции по уровню. */
  @Get(':id')
  async findById(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocPageMetadata | DocPageDetail> {
    return this.docs.findById(subject, projectId, id);
  }

  /** Создаёт страницу. Требуется уровень записи. */
  @Post()
  async create(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(docPageCreateSchema)) body: DocPageCreate,
  ): Promise<DocPageMetadata | DocPageDetail> {
    const created = await this.docs.create(subject, projectId, body);

    return this.docs.findById(subject, projectId, created.id);
  }

  /** Правит страницу. */
  @Patch(':id')
  async update(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(docPageUpdateSchema)) body: DocPageUpdate,
  ): Promise<DocPageMetadata | DocPageDetail> {
    await this.docs.update(subject, projectId, id, body);

    return this.docs.findById(subject, projectId, id);
  }

  /** Удаляет страницу. */
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.docs.remove(subject, projectId, id);
  }
}
