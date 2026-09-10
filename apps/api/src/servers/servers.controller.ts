import {
  serverCreateSchema,
  serverUpdateSchema,
  type ServerCreate,
  type ServerDetail,
  type ServerRow,
  type ServerUpdate,
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
import { SuperadminGuard } from '../access/superadmin.guard';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { Server } from '../db/schema';
import { ServersService } from './servers.service';

/**
 * Реестр серверов (спека этапа 9, раздел 3).
 *
 * Закрыт правом суперадмина, а не выдачей: сервер межпроектен, и показать
 * подрядчику список машин значило бы раскрыть чужую инфраструктуру.
 * Остальным `SuperadminGuard` отвечает `404`, не подтверждая существования
 * раздела.
 */
@Controller('servers')
@UseGuards(SessionGuard, SuperadminGuard)
export class ServersController {
  constructor(private readonly servers: ServersService) {}

  /** Реестр серверов со статусом и счётчиками. */
  @Get()
  async list(): Promise<ServerRow[]> {
    return this.servers.list();
  }

  /** Сервер вместе с размещёнными окружениями. */
  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<ServerDetail> {
    return this.servers.findById(id);
  }

  /** Заводит сервер. */
  @Post()
  async create(
    @CurrentSubject() subject: RequestSubject,
    @Body(new ZodValidationPipe(serverCreateSchema)) input: ServerCreate,
  ): Promise<Server> {
    return this.servers.create(subject, input);
  }

  /** Меняет сервер. */
  @Patch(':id')
  async update(
    @CurrentSubject() subject: RequestSubject,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(serverUpdateSchema)) input: ServerUpdate,
  ): Promise<Server> {
    return this.servers.update(subject, id, input);
  }

  /** Удаляет сервер. Занятый сервер удалить нельзя. */
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentSubject() subject: RequestSubject,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.servers.remove(subject, id);
  }
}
