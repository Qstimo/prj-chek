import {
  chronicleEntryCreateSchema,
  chronicleEntryUpdateSchema,
  type ChronicleDetail,
  type ChronicleEntryCreate,
  type ChronicleEntryUpdate,
  type ChronicleMetadata,
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
import { ChronicleService } from './chronicle.service';

/**
 * Секция «Хроника» (спека 6).
 *
 * Guard'а уровня нет намеренно: уровень проверяет репозиторий,
 * и дублирующая проверка в HTTP-слое разошлась бы с ним (ТЗ 4.1).
 */
@Controller('projects/:projectId/chronicle')
@UseGuards(SessionGuard)
export class ChronicleController {
  constructor(private readonly chronicle: ChronicleService) {}

  /** Лента проекта в проекции по уровню доступа. */
  @Get()
  async list(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<(ChronicleMetadata | ChronicleDetail)[]> {
    return this.chronicle.list(subject, projectId);
  }

  /** Одна запись в проекции по уровню доступа. */
  @Get(':id')
  async findById(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ChronicleMetadata | ChronicleDetail> {
    return this.chronicle.findById(subject, projectId, id);
  }

  /** Создаёт запись. Требуется уровень записи на секции. */
  @Post()
  async create(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(chronicleEntryCreateSchema)) body: ChronicleEntryCreate,
  ): Promise<ChronicleMetadata | ChronicleDetail> {
    const created = await this.chronicle.create(subject, projectId, body);

    // Повторное чтение применяет проекцию по уровню: сервис возвращает
    // голую строку таблицы, а наружу уходит только разрешённое.
    return this.chronicle.findById(subject, projectId, created.id);
  }

  /** Изменяет запись. */
  @Patch(':id')
  async update(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(chronicleEntryUpdateSchema)) body: ChronicleEntryUpdate,
  ): Promise<ChronicleMetadata | ChronicleDetail> {
    await this.chronicle.update(subject, projectId, id, body);

    return this.chronicle.findById(subject, projectId, id);
  }

  /** Удаляет запись. */
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.chronicle.remove(subject, projectId, id);
  }
}
