import {
  domainCreateSchema,
  domainUpdateSchema,
  type DomainCreate,
  type DomainDetail,
  type DomainMap,
  type DomainRow,
  type DomainUpdate,
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
import type { Domain } from '../db/schema';
import { DomainsService } from './domains.service';

/**
 * Реестр корневых доменов (спека этапа 10, раздел 3).
 *
 * Закрыт правом суперадмина: корень межпроектен, и список чужих доменов
 * подрядчику видеть незачем — тот получает `403`, как и на `/users`. Сами
 * адреса своих окружений он по-прежнему заводит сам, через секцию
 * «Инфраструктура».
 */
@Controller('domains')
@UseGuards(SessionGuard, SuperadminGuard)
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  /** Реестр корней со статусом и счётчиками. */
  @Get()
  async list(): Promise<DomainRow[]> {
    return this.domains.list();
  }

  /** Данные карты. Объявлен до `:id`, иначе «map» уйдёт в параметр. */
  @Get('map')
  async map(): Promise<DomainMap> {
    return this.domains.map();
  }

  /** Корень вместе с поддоменами. */
  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<DomainDetail> {
    return this.domains.findById(id);
  }

  /** Заводит корень вручную. */
  @Post()
  async create(
    @CurrentSubject() subject: RequestSubject,
    @Body(new ZodValidationPipe(domainCreateSchema)) input: DomainCreate,
  ): Promise<Domain> {
    return this.domains.create(subject, input);
  }

  /** Меняет свойства корня. */
  @Patch(':id')
  async update(
    @CurrentSubject() subject: RequestSubject,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(domainUpdateSchema)) input: DomainUpdate,
  ): Promise<Domain> {
    return this.domains.update(subject, id, input);
  }

  /** Удаляет корень. Занятый корень удалить нельзя. */
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentSubject() subject: RequestSubject,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.domains.remove(subject, id);
  }
}
