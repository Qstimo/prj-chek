import {
  environmentCreateSchema,
  environmentDomainCreateSchema,
  environmentUpdateSchema,
  type EnvironmentCreate,
  type EnvironmentDetail,
  type EnvironmentDomainCreate,
  type EnvironmentMetadata,
  type EnvironmentUpdate,
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
import { EnvironmentsService } from './environments.service';

/**
 * Секция «Инфраструктура» (спека 6).
 *
 * Guard'а уровня доступа здесь нет намеренно: уровень проверяет репозиторий,
 * и дублирующая проверка в HTTP-слое создала бы второе место, где правило
 * можно изменить и разойтись с первым (ТЗ 4.1).
 */
@Controller('projects/:projectId/environments')
@UseGuards(SessionGuard)
export class EnvironmentsController {
  constructor(private readonly environments: EnvironmentsService) {}

  /** Окружения проекта в проекции по уровню доступа. */
  @Get()
  async list(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<(EnvironmentMetadata | EnvironmentDetail)[]> {
    return this.environments.list(subject, projectId);
  }

  /** Одно окружение в проекции по уровню доступа. */
  @Get(':id')
  async findById(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EnvironmentMetadata | EnvironmentDetail> {
    return this.environments.findById(subject, projectId, id);
  }

  /** Создаёт окружение. Требуется уровень записи на секции. */
  @Post()
  async create(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(environmentCreateSchema)) body: EnvironmentCreate,
  ): Promise<EnvironmentMetadata | EnvironmentDetail> {
    const created = await this.environments.create(subject, projectId, body);

    // Повторное чтение не лишний запрос: оно собирает домены и применяет
    // проекцию по уровню, а сервис возвращает голую строку таблицы.
    return this.environments.findById(subject, projectId, created.id);
  }

  /** Изменяет окружение. */
  @Patch(':id')
  async update(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(environmentUpdateSchema)) body: EnvironmentUpdate,
  ): Promise<EnvironmentMetadata | EnvironmentDetail> {
    await this.environments.update(subject, projectId, id, body);

    return this.environments.findById(subject, projectId, id);
  }

  /**
   * Заводит один адрес окружения.
   *
   * Отдельный адрес, а не весь набор: так адрес добавляется из реестра
   * доменов, где остальных адресов окружения перед глазами нет.
   */
  @Post(':id/domains')
  async addDomain(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(environmentDomainCreateSchema)) body: EnvironmentDomainCreate,
  ): Promise<EnvironmentMetadata | EnvironmentDetail> {
    await this.environments.addDomain(subject, projectId, id, body);

    return this.environments.findById(subject, projectId, id);
  }

  /** Снимает один адрес окружения. Корень остаётся в реестре доменов. */
  @Delete(':id/domains/:domainId')
  async removeDomain(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('domainId', ParseUUIDPipe) domainId: string,
  ): Promise<EnvironmentMetadata | EnvironmentDetail> {
    await this.environments.removeDomain(subject, projectId, id, domainId);

    return this.environments.findById(subject, projectId, id);
  }

  /** Удаляет окружение вместе с доменами. */
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.environments.remove(subject, projectId, id);
  }
}
