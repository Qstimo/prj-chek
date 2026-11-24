import { taskExportRequestSchema, type TaskExport, type TaskExportRequest, type TaskExportResult } from '@cairn/shared';
import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TaskExportsService } from './task-exports.service';

/**
 * Выгрузка задач проекта во внешний трекер.
 *
 * Адрес — `POST /projects/:id/tasks/export` (план, C2): выгружают **задачи**,
 * и человек приходит сюда с экрана задач. Поэтому префикс тот же, что у
 * `TasksController`, а контроллер — второй, и это решение: код выгрузки
 * принадлежит трекеру, а обратный импорт (`TasksModule` → `TrackerModule`,
 * который уже читает задачи) замкнул бы кольцо модулей, разрывать которое
 * пришлось бы `forwardRef`. Столкновения маршрутов не возникает: `export` —
 * один сегмент после `tasks`, а у ручек задач там либо ничего, либо
 * `:taskId/...`.
 *
 * Право — запись на «Роадмап», и проверяет его служба через репозитории
 * (ТЗ 4.1). Токен подключения здесь не появляется ни в одном параметре и ни
 * в одном ответе.
 */
@Controller('projects/:projectId/tasks')
@UseGuards(SessionGuard)
export class TaskExportsController {
  constructor(private readonly exports: TaskExportsService) {}

  @Post(':taskId/link')
  async link(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<TaskExport> {
    return this.exports.link(subject, projectId, taskId);
  }

  /**
   * Выгружает отмеченные задачи и отвечает итогом на каждую.
   *
   * `201` с итогами (умолчание Nest для `POST`, и переопределять его не за
   * чем), а не `502` на первой неудаче: исход у набора не один
   * (см. `taskExportResultSchema`). Кодом HTTP остаются отказы, которые
   * относятся ко всему набору и случаются до первого байта наружу: нет
   * выдачи — `404`, уровень ниже — `403`, нет привязки или подключения —
   * `409`, нет задачи — `404`.
   */
  @Post('export')
  async export(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(taskExportRequestSchema)) body: TaskExportRequest,
  ): Promise<TaskExportResult[]> {
    return this.exports.export(subject, projectId, body);
  }
}
