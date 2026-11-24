import {
  trackerBindingUpdateSchema,
  type ProjectTracker,
  type TrackerBinding,
  type TrackerBindingUpdate,
  type TrackerTargets,
} from '@cairn/shared';
import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TrackerService } from './tracker.service';

/**
 * Трекер со стороны проекта: куда выгружать его задачи (дизайн, 9.3).
 *
 * Право — **«Роадмап»**, и новой единицы выдачи доступа не появилось:
 * привязка отвечает на вопрос «куда поедут наши задачи», а задача
 * принадлежит роадмапу. Чтение — видеть, куда настроено; запись — менять
 * это и спрашивать живые списки трекера.
 *
 * Токен здесь не появляется ни в одном ответе и ни в одном параметре:
 * списки идут через эту ручку именно затем, чтобы он не покидал сервер.
 */
@Controller('projects/:projectId/tracker')
@UseGuards(SessionGuard)
export class ProjectTrackerController {
  constructor(private readonly tracker: TrackerService) {}

  /** Готовность трекера и привязка проекта. Настройки установки здесь нет. */
  @Get()
  async find(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<ProjectTracker> {
    return this.tracker.findForProject(subject, projectId);
  }

  /**
   * Живые списки трекера: проекты, доски и колонки.
   *
   * `GET`, хотя за ней стоит обращение к чужому API: она ничего не меняет
   * ни у нас, ни в трекере. Право при этом требуется **на запись**: списки
   * нужны только для правки привязки, а наш токен — не то, чем вправе
   * дёргать чужой API всякий, кому видно «Роадмап».
   */
  @Get('targets')
  async targets(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<TrackerTargets> {
    return this.tracker.targets(subject, projectId);
  }

  /** Ставит привязку проекта целиком: все три идентификатора вместе. */
  @Put('binding')
  async saveBinding(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(trackerBindingUpdateSchema)) input: TrackerBindingUpdate,
  ): Promise<TrackerBinding> {
    return this.tracker.saveBinding(subject, projectId, input);
  }
}
