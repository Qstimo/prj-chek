import {
  addressIncidentsQuerySchema,
  type AddressIncidentHistory,
  type AddressIncidentsQuery,
  type ProjectIncidents,
} from '@cairn/shared';
import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
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

/**
 * История падений одного адреса (дизайн, раздел 5).
 *
 * Своя ручка, а не фильтр по выдаче проекта: панель разбора открывается на
 * один адрес, и право у неё то же, что у статуса, — метаданные
 * «Инфраструктуры». Проверка живёт в выборке, поэтому здесь её нет: чужой
 * адрес и отсутствие выдачи одинаково дают `404`.
 */
@Controller('projects/:projectId/addresses/:addressId/incidents')
@UseGuards(SessionGuard)
export class AddressIncidentsController {
  constructor(private readonly incidents: IncidentsRepository) {}

  /** Сводка простоя за окно и страница падений адреса. */
  @Get()
  async history(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Query(new ZodValidationPipe(addressIncidentsQuerySchema)) query: AddressIncidentsQuery,
  ): Promise<AddressIncidentHistory> {
    return this.incidents.forAddress(subject, projectId, addressId, query);
  }
}
