import {
  AuditSubjectKind,
  type ProjectTask,
  type ProjectTaskCreate,
  type ProjectTaskUpdate,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import type { ProjectTaskRow } from '../db/schema';
import { TasksRepository } from './tasks.repository';

/**
 * Задачи проекта: изменения вместе с журналированием.
 *
 * Запись в журнал идёт той же транзакцией, что правка, — как у платформ и
 * серверов, и по той же причине: иначе журнал рассказывал бы о правках,
 * которых не случилось.
 *
 * Правка формулировки журналируется, в отличие от правки строки черновика
 * саммари: черновик — поверхность до подтверждения, а задача — запись
 * проекта, и у потери содержимого обязан быть ответ (дизайн, 7).
 *
 * Чтение пробрасывается в репозиторий как есть — проверку прав делает он.
 */
@Injectable()
export class TasksService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: TasksRepository,
    private readonly audit: AuditService,
  ) {}

  /** Задачи проекта вместе с размещением. */
  async findForProject(
    subject: RequestSubject,
    projectId: string,
    filter: { loose?: boolean } = {},
  ): Promise<ProjectTask[]> {
    return this.repository.findForProject(subject, projectId, filter);
  }

  /** Заводит задачу вне версий. */
  async create(
    subject: RequestSubject,
    projectId: string,
    input: ProjectTaskCreate,
  ): Promise<ProjectTaskRow> {
    return this.db.transaction(async (tx) => {
      const created = await this.repository.create(subject, tx, projectId, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.TaskCreated,
        entityType: 'task',
        entityId: created.id,
        projectId,
        metadata: { title: created.title, origin: created.origin },
      });

      return created;
    });
  }

  /** Правит задачу. */
  async update(
    subject: RequestSubject,
    projectId: string,
    taskId: string,
    input: ProjectTaskUpdate,
  ): Promise<ProjectTaskRow> {
    return this.db.transaction(async (tx) => {
      const updated = await this.repository.update(subject, tx, projectId, taskId, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.TaskUpdated,
        entityType: 'task',
        entityId: taskId,
        projectId,
        // Имена полей, но не значения, — правило журнала одно на все
        // сущности. Формулировка среди значений не называется: она сама
        // и есть содержимое, а журнал его не хранит.
        metadata: { fields: Object.keys(input) },
      });

      return updated;
    });
  }

  /** Удаляет задачу из реестра вместе с её зеркалом выгрузки. */
  async remove(subject: RequestSubject, projectId: string, taskId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const removed = await this.repository.remove(subject, tx, projectId, taskId);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.TaskDeleted,
        entityType: 'task',
        entityId: taskId,
        projectId,
        metadata: {
          // Формулировка здесь есть, в отличие от правки: удаление уносит
          // её целиком, и запись «удалена задача такой-то uuid» не сказала
          // бы ничего.
          title: removed.task.title,
          // Задача в трекере удаление в CAIRN переживает: удалять чужую
          // задачу по своей кнопке мы не вправе (дизайн, 10.5). Поэтому
          // идентификатор унесённого зеркала называется здесь — журнал
          // остаётся единственным следом ответа на «а в трекере она
          // осталась?», а из реестра этот ответ уходит вместе со строкой.
          // `null` у невыгруженной задачи означает ровно «её там и не
          // было», и это не то же самое, что отсутствие поля у записей,
          // заведённых до появления выгрузки.
          trackerExternalId: removed.export?.externalId ?? null,
        },
      });
    });
  }

  /** Вынимает задачу из версии, оставляя в реестре. */
  async detach(subject: RequestSubject, projectId: string, taskId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const task = await this.repository.detach(subject, tx, projectId, taskId);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.TaskDetached,
        entityType: 'task',
        entityId: taskId,
        projectId,
        metadata: { title: task.title },
      });
    });
  }
}

/** Актор журнала из субъекта запроса. */
function actorOf(subject: RequestSubject): AuditActor {
  return {
    kind: subject.kind as unknown as Exclude<AuditSubjectKind, AuditSubjectKind.System>,
    id: subject.id,
    label: subject.label,
  };
}
