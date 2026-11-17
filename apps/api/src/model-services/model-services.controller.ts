import {
  modelServiceUpdateSchema,
  type ModelProbeResult,
  type ModelServiceKind,
  type ModelServiceSettings,
  type ModelServiceUpdate,
} from '@cairn/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import type { RequestSubject } from '../access/access.types';
import { SuperadminGuard } from '../access/superadmin.guard';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ModelServiceKindPipe } from './model-service-kind.pipe';
import { ModelServicesService } from './model-services.service';

/**
 * Настройка служб модели (дизайн, раздел 5.1).
 *
 * Закрыта правом суперадмина, а не выдачей: настройка одна на установку и
 * ни одному проекту не принадлежит, а подрядчик, получивший уровень
 * записи, сменил бы узел, на который уходят созвоны **всех** проектов.
 * Новой единицы выдачи доступа не появляется — секций по-прежнему шесть
 * (дизайн, 1.1).
 */
@Controller('model-services')
@UseGuards(SessionGuard, SuperadminGuard)
export class ModelServicesController {
  constructor(private readonly services: ModelServicesService) {}

  /** Настройки всех узлов перечня, включая ненастроенные. */
  @Get()
  async list(): Promise<ModelServiceSettings[]> {
    return this.services.list();
  }

  /** Действующая настройка узла. */
  @Get(':kind')
  async findByKind(
    @Param('kind', ModelServiceKindPipe) kind: ModelServiceKind,
  ): Promise<ModelServiceSettings> {
    return this.services.findByKind(kind);
  }

  /**
   * Задаёт настройку узла целиком.
   *
   * `PUT`, а не `PATCH`: настройка — одна строка, и правится она целиком,
   * как набор тегов проекта. Частичная правка потребовала бы трёхзначного
   * «поле отсутствует / пустое / заданное» на каждом поле, а не только на
   * ключе, где это неизбежно (дизайн, 5.1).
   */
  @Put(':kind')
  async save(
    @CurrentSubject() subject: RequestSubject,
    @Param('kind', ModelServiceKindPipe) kind: ModelServiceKind,
    @Body(new ZodValidationPipe(modelServiceUpdateSchema)) input: ModelServiceUpdate,
  ): Promise<ModelServiceSettings> {
    return this.services.save(subject, kind, input);
  }

  /** Сбрасывает настройку к окружению. Отсутствующую строку терпит. */
  @Delete(':kind')
  @HttpCode(204)
  async clear(
    @CurrentSubject() subject: RequestSubject,
    @Param('kind', ModelServiceKindPipe) kind: ModelServiceKind,
  ): Promise<void> {
    await this.services.clear(subject, kind);
  }

  /**
   * Проверяет связь с узлом по сохранённой настройке.
   *
   * Тела **не принимает вовсе**, и это исполнение решения 8.4 в коде, а не
   * на словах: приняв ключ в теле, ручка завела бы второй путь, по
   * которому секрет ходит, — и этот путь проходит через тело `POST`,
   * которое попадает в логи обратного прокси у любого, кто их включил.
   *
   * Неудачная проверка — `200` с исходом: наша ручка справилась, когда
   * выяснила, что чужой узел не отвечает (дизайн, 5.1).
   */
  @Post(':kind/probe')
  @HttpCode(200)
  async probe(
    @CurrentSubject() subject: RequestSubject,
    @Param('kind', ModelServiceKindPipe) kind: ModelServiceKind,
    // `.default({})` — потому что у запроса без тела тела и нет вовсе:
    // отсутствующее годится, непустое получает `400`.
    @Body(new ZodValidationPipe(z.object({}).strict().default({}))) _body: unknown,
  ): Promise<ModelProbeResult> {
    return this.services.probe(subject, kind);
  }
}
