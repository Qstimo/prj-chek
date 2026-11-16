import {
  AuditSubjectKind,
  type ProjectStatus,
  type StatusSummaryRow,
} from '@cairn/shared';
import { ConflictException, Inject, Injectable } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { StatusRepository } from './status.repository';
import { StatusRunOutcome, StatusRunnerService } from './status-runner.service';

/** Статусы: агрегаты для интерфейса и ручной запуск проверок. */
@Injectable()
export class StatusService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: StatusRepository,
    private readonly runner: StatusRunnerService,
    private readonly audit: AuditService,
  ) {}

  /** Агрегированный статус проекта. */
  async projectStatus(subject: RequestSubject, projectId: string): Promise<ProjectStatus> {
    return this.repository.statusForProject(subject, projectId);
  }

  /** Сводка по видимым проектам. */
  async summary(subject: RequestSubject): Promise<StatusSummaryRow[]> {
    return this.repository.summary(subject);
  }

  /**
   * Ручной запуск всех проверок.
   *
   * В отличие от фонового цикла — действие субъекта, и потому в журнале.
   * Помечается ручным: человек ждёт ответа, и паузу переспроса прогон
   * в этом случае не берёт.
   *
   * Запускается в фоне, а ответ отдаётся сразу: обход десятков адресов с
   * пределом ожидания в десять секунд на каждый идёт минуты, и запрос
   * браузера рвался по таймауту прежде, чем прогон кончался. Идущий
   * прогон — не ошибка запроса, но и не «принято»: об этом говорится
   * отдельно, иначе человек ждал бы обновления, которого не будет.
   */
  async runNow(subject: RequestSubject): Promise<void> {
    if (this.runner.start({ isManual: true }) === StatusRunOutcome.Busy) {
      throw new ConflictException('Проверки уже идут. Подождите, пока прогон закончится.');
    }

    await this.db.transaction(async (tx) => {
      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.StatusCheckRun,
        entityType: 'status_check',
      });
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
