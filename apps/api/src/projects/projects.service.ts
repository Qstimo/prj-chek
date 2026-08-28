import {
  AuditSubjectKind,
  type ProjectCreate,
  type ProjectDetail,
  type ProjectMetadata,
  type ProjectUpdate,
  type SectionLevels,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';

import { SectionNotVisibleError } from '../access/access.errors';
import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import type { Project } from '../db/schema';
import { ProjectsRepository } from './projects.repository';

/**
 * Проекты: изменения вместе с журналированием.
 *
 * Права проверяет репозиторий — он единственный путь к данным (спека 5.4).
 * Сервис добавляет к этому запись в журнал в той же транзакции (спека 7.3).
 */
@Injectable()
export class ProjectsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: ProjectsRepository,
    private readonly audit: AuditService,
    private readonly access: AccessService,
  ) {}

  /**
   * Возвращает уровни субъекта по секциям проекта.
   *
   * Проект, к которому нет ни одной выдачи, обязан выглядеть
   * несуществующим: пустая карта сообщила бы о его существовании.
   */
  async sectionsFor(subject: RequestSubject, projectId: string): Promise<SectionLevels> {
    const levels = await this.access.levelsForProject(subject, projectId);

    if (Object.keys(levels).length === 0) {
      throw new SectionNotVisibleError();
    }

    return levels;
  }

  /** Возвращает список видимых субъекту проектов. */
  async list(subject: RequestSubject): Promise<ProjectMetadata[]> {
    return this.repository.findVisible(subject);
  }

  /** Возвращает проект в проекции, соответствующей уровню доступа. */
  async findById(
    subject: RequestSubject,
    projectId: string,
  ): Promise<ProjectMetadata | ProjectDetail> {
    return this.repository.findById(subject, projectId);
  }

  /** Создаёт проект. Право проверяет репозиторий. */
  async create(subject: RequestSubject, input: ProjectCreate): Promise<Project> {
    return this.db.transaction(async (tx) => {
      const created = await this.repository.create(subject, tx, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.ProjectCreated,
        entityType: 'project',
        entityId: created.id,
        projectId: created.id,
        metadata: { name: created.name },
      });

      return created;
    });
  }

  /**
   * Изменяет проект.
   *
   * В журнал попадают имена изменённых полей, но не их значения: на этапе 4
   * тем же путём пойдут переменные окружения, и запись значений в журнал
   * свела бы на нет их шифрование (ТЗ 9).
   */
  async update(
    subject: RequestSubject,
    projectId: string,
    input: ProjectUpdate,
  ): Promise<Project> {
    return this.db.transaction(async (tx) => {
      const updated = await this.repository.update(subject, tx, projectId, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.ProjectUpdated,
        entityType: 'project',
        entityId: projectId,
        projectId,
        metadata: { fields: Object.keys(input) },
      });

      return updated;
    });
  }
}

/** Строит действующее лицо журнала из субъекта запроса. */
function actorOf(subject: RequestSubject): AuditActor {
  return {
    kind: subject.kind as unknown as Exclude<AuditSubjectKind, AuditSubjectKind.System>,
    id: subject.id,
    label: subject.label,
  };
}
