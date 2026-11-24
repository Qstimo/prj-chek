import {
  projectTaskCreateSchema,
  projectTaskUpdateSchema,
  type ProjectTask,
  type ProjectTaskCreate,
  type ProjectTaskUpdate,
} from '@cairn/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TasksService } from './tasks.service';

/**
 * Задачи проекта: реестр, из которого они попадают в версии.
 *
 * Адрес под проектом, а не свой верхний: задача принадлежит проекту, и
 * право на неё — право на его «Роадмап». Своей единицы выдачи доступа у
 * задач нет, секций по-прежнему шесть.
 *
 * Ответы собираются службой целиком (`findForProject`), а не литералом у
 * каждой ручки: у задачи есть размещение, и собрать его из строки таблицы
 * контроллер не может — для этого нужен join, то есть репозиторий.
 */
@Controller('projects/:projectId/tasks')
@UseGuards(SessionGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  /**
   * Задачи проекта: вне версий сверху.
   *
   * `loose` приходит строкой запроса и отдаёт только задачи вне версий —
   * тот же фильтр, что живёт в адресе экрана.
   */
  @Get()
  async list(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('loose') loose?: string,
  ): Promise<ProjectTask[]> {
    return this.tasks.findForProject(subject, projectId, { loose: loose === 'true' });
  }

  /** Заводит задачу вне версий. */
  @Post()
  async create(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(projectTaskCreateSchema)) body: ProjectTaskCreate,
  ): Promise<ProjectTask> {
    const created = await this.tasks.create(subject, projectId, body);

    return this.oneOf(subject, projectId, created.id);
  }

  /** Правит формулировку, ссылку и теги. */
  @Put(':taskId')
  async update(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body(new ZodValidationPipe(projectTaskUpdateSchema)) body: ProjectTaskUpdate,
  ): Promise<ProjectTask> {
    await this.tasks.update(subject, projectId, taskId, body);

    return this.oneOf(subject, projectId, taskId);
  }

  /** Удаляет задачу. Размещённую — `409`: сначала выньте из версии. */
  @Delete(':taskId')
  @HttpCode(204)
  async remove(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<void> {
    await this.tasks.remove(subject, projectId, taskId);
  }

  /** Вынимает задачу из версии, оставляя её в реестре. */
  @Post(':taskId/detach')
  async detach(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<ProjectTask> {
    await this.tasks.detach(subject, projectId, taskId);

    return this.oneOf(subject, projectId, taskId);
  }

  /**
   * Одна задача из реестра после правки.
   *
   * Чтением списка, а не своим запросом: размещение собирается join'ом, и
   * второй способ его собрать разошёлся бы с первым. Пропасть задача
   * между правкой и чтением не может — обе идут под одним субъектом, а
   * исчезнуть она могла бы только своим же удалением.
   */
  private async oneOf(
    subject: RequestSubject,
    projectId: string,
    taskId: string,
  ): Promise<ProjectTask> {
    const tasks = await this.tasks.findForProject(subject, projectId);

    return tasks.find((task) => task.id === taskId)!;
  }
}
