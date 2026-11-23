import {
  trackerConnectionUpdateSchema,
  type TrackerConnection,
  type TrackerConnectionUpdate,
  type TrackerKind,
  type TrackerProbeResult,
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
import { TrackerKindPipe } from './tracker-kind.pipe';
import { TrackerService } from './tracker.service';

/**
 * Подключение внешнего трекера задач (дизайн, 9.1).
 *
 * Закрыто правом суперадмина, а не выдачей: подключение одно на установку и
 * ни одному проекту не принадлежит, а подрядчик, получивший уровень записи,
 * сменил бы адрес, на который уезжают формулировки задач **всех** проектов.
 * Новой единицы выдачи доступа не появляется — секций по-прежнему шесть.
 *
 * Своим контроллером рядом с `/projects/:id/tracker`, а не методами там же:
 * у них разные охранники и разные читатели, и один контроллер с двумя
 * наборами `@UseGuards` на методах прятал бы эту границу в декораторах.
 */
@Controller('tracker-connections')
@UseGuards(SessionGuard, SuperadminGuard)
export class TrackerController {
  constructor(private readonly tracker: TrackerService) {}

  /** Подключения всех видов перечня, включая ненастроенные. */
  @Get()
  async list(): Promise<TrackerConnection[]> {
    return this.tracker.list();
  }

  /** Действующее подключение вида. */
  @Get(':kind')
  async findByKind(@Param('kind', TrackerKindPipe) kind: TrackerKind): Promise<TrackerConnection> {
    return this.tracker.find(kind);
  }

  /**
   * Задаёт подключение целиком.
   *
   * `PUT`, а не `PATCH`: подключение — одна строка, и правится она целиком.
   * Частичная правка потребовала бы трёхзначного «поле отсутствует /
   * пустое / заданное» на каждом поле, а не только на токене, где это
   * неизбежно.
   */
  @Put(':kind')
  async save(
    @CurrentSubject() subject: RequestSubject,
    @Param('kind', TrackerKindPipe) kind: TrackerKind,
    @Body(new ZodValidationPipe(trackerConnectionUpdateSchema)) input: TrackerConnectionUpdate,
  ): Promise<TrackerConnection> {
    return this.tracker.save(subject, kind, input);
  }

  /** Снимает подключение. Отсутствующую строку терпит. */
  @Delete(':kind')
  @HttpCode(204)
  async clear(
    @CurrentSubject() subject: RequestSubject,
    @Param('kind', TrackerKindPipe) kind: TrackerKind,
  ): Promise<void> {
    await this.tracker.clear(subject, kind);
  }

  /**
   * Проверяет связь с трекером по сохранённому подключению.
   *
   * Тела **не принимает вовсе**: приняв токен в теле, ручка завела бы
   * второй путь, по которому секрет ходит, — и этот путь проходит через
   * тело `POST`, которое попадает в логи обратного прокси у любого, кто их
   * включил.
   *
   * Неудачная проверка — `200` с исходом: наша ручка справилась, когда
   * выяснила, что чужой трекер не отвечает.
   */
  @Post(':kind/probe')
  @HttpCode(200)
  async probe(
    @CurrentSubject() subject: RequestSubject,
    @Param('kind', TrackerKindPipe) kind: TrackerKind,
    // `.default({})` — потому что у запроса без тела тела и нет вовсе:
    // отсутствующее годится, непустое получает `400`.
    @Body(new ZodValidationPipe(z.object({}).strict().default({}))) _body: unknown,
  ): Promise<TrackerProbeResult> {
    return this.tracker.probe(subject, kind);
  }
}
