import {
  AuditSubjectKind,
  type ImportResult,
  type RevealResponse,
  type Variable,
  type VariableCreate,
  type VariableUpdate,
  type VariableVersion,
  type VariablesEnvironment,
} from '@cairn/shared';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { parseEnv, serializeEnv } from './env-format';
import { VariablesRepository } from './variables.repository';

/**
 * Переменные: операции вместе с журналированием (ТЗ 3.3).
 *
 * Каждое раскрытие значения — включая выгрузку — оставляет след в журнале
 * в той же транзакции, что и чтение. Значения в журнал не попадают
 * ни при каком действии (ТЗ 9): записи хранят ключи и номера версий.
 */
@Injectable()
export class VariablesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: VariablesRepository,
    private readonly audit: AuditService,
  ) {}

  /** Список без значений. */
  async list(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
  ): Promise<Variable[]> {
    return this.repository.list(subject, projectId, environmentId);
  }

  /** Окружения проекта для переключателя страницы переменных. */
  async listEnvironments(
    subject: RequestSubject,
    projectId: string,
  ): Promise<VariablesEnvironment[]> {
    return this.repository.listEnvironments(subject, projectId);
  }

  /** История версий без значений. */
  async versions(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
    variableId: string,
  ): Promise<VariableVersion[]> {
    return this.repository.versions(subject, projectId, environmentId, variableId);
  }

  /** Создаёт переменную с первой версией. */
  async create(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
    input: VariableCreate,
  ) {
    return this.db.transaction(async (tx) => {
      const created = await this.repository.create(subject, tx, projectId, environmentId, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.VariableCreated,
        entityType: 'variable',
        entityId: created.id,
        projectId,
        metadata: { key: created.key, environmentId },
      });

      return created;
    });
  }

  /** Правка: паспорт и, при переданном `value`, новая версия. */
  async update(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
    variableId: string,
    input: VariableUpdate,
  ) {
    return this.db.transaction(async (tx) => {
      const { value, ...meta } = input;

      let updated =
        Object.keys(meta).length > 0
          ? await this.repository.updateMeta(
              subject,
              tx,
              projectId,
              environmentId,
              variableId,
              meta,
            )
          : null;

      let versionNo: number | null = null;

      if (value !== undefined) {
        versionNo = await this.repository.appendVersion(
          subject,
          tx,
          projectId,
          environmentId,
          variableId,
          value,
        );
      }

      updated ??= await this.repository.updateMeta(
        subject,
        tx,
        projectId,
        environmentId,
        variableId,
        {},
      );

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.VariableUpdated,
        entityType: 'variable',
        entityId: variableId,
        projectId,
        metadata: {
          key: updated.key,
          fields: Object.keys(input),
          ...(versionNo ? { versionNo } : {}),
        },
      });

      return updated;
    });
  }

  /** Удаляет переменную вместе с версиями. */
  async remove(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
    variableId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const removed = await this.repository.remove(
        subject,
        tx,
        projectId,
        environmentId,
        variableId,
      );

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.VariableDeleted,
        entityType: 'variable',
        entityId: variableId,
        projectId,
        metadata: { key: removed.key, environmentId },
      });
    });
  }

  /** Раскрывает текущее значение. Чтение и журнал — одна транзакция. */
  async reveal(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
    variableId: string,
  ): Promise<RevealResponse> {
    return this.db.transaction(async (tx) => {
      const revealed = await this.repository.reveal(
        subject,
        projectId,
        environmentId,
        variableId,
        tx,
      );

      await this.recordReveal(tx, subject, projectId, environmentId, variableId, revealed);

      return { value: revealed.value, versionNo: revealed.versionNo };
    });
  }

  /**
   * Раскрытие для агента (ТЗ 7.3): уровень «метаданные» + флаг токена.
   *
   * Вызывающий обязан проверить `canRevealVariables` до вызова.
   * Журнал получает штатный `variable.revealed` от лица токена.
   */
  async revealForAgent(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
    variableId: string,
  ): Promise<RevealResponse> {
    return this.db.transaction(async (tx) => {
      const revealed = await this.repository.revealForAgent(
        subject,
        projectId,
        environmentId,
        variableId,
        tx,
      );

      await this.recordReveal(tx, subject, projectId, environmentId, variableId, revealed);

      return { value: revealed.value, versionNo: revealed.versionNo };
    });
  }

  /** Раскрывает историческую версию. */
  async revealVersion(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
    variableId: string,
    versionNo: number,
  ): Promise<RevealResponse> {
    return this.db.transaction(async (tx) => {
      const revealed = await this.repository.revealVersion(
        subject,
        projectId,
        environmentId,
        variableId,
        versionNo,
        tx,
      );

      await this.recordReveal(tx, subject, projectId, environmentId, variableId, revealed);

      return { value: revealed.value, versionNo: revealed.versionNo };
    });
  }

  /** Откат к версии: новая версия поверх, журнал хранит номера. */
  async rollback(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
    variableId: string,
    toVersion: number,
  ): Promise<number> {
    return this.db.transaction(async (tx) => {
      const newVersion = await this.repository.rollback(
        subject,
        tx,
        projectId,
        environmentId,
        variableId,
        toVersion,
      );

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.VariableRolledBack,
        entityType: 'variable',
        entityId: variableId,
        projectId,
        metadata: { toVersion, newVersion },
      });

      return newVersion;
    });
  }

  /**
   * Импорт `.env`: создаёт новые ключи, обновляет изменившиеся,
   * не трогает совпавшие и ничего не удаляет (спека 6).
   */
  async importEnv(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
    content: string,
  ): Promise<ImportResult> {
    let pairs;

    try {
      pairs = parseEnv(content);
    } catch (cause) {
      throw new BadRequestException(cause instanceof Error ? cause.message : 'Не разобрать файл');
    }

    return this.db.transaction(async (tx) => {
      const existing = new Map(
        (await this.repository.list(subject, projectId, environmentId, tx)).map((variable) => [
          variable.key,
          variable.id,
        ]),
      );

      const result: ImportResult = { created: [], updated: [], unchanged: [] };

      for (const pair of pairs) {
        const variableId = existing.get(pair.key);

        if (!variableId) {
          await this.repository.create(subject, tx, projectId, environmentId, {
            key: pair.key,
            value: pair.value,
          });
          result.created.push(pair.key);

          continue;
        }

        const versionNo = await this.repository.appendVersion(
          subject,
          tx,
          projectId,
          environmentId,
          variableId,
          pair.value,
        );

        (versionNo === null ? result.unchanged : result.updated).push(pair.key);
      }

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.VariablesImported,
        entityType: 'environment',
        entityId: environmentId,
        projectId,
        metadata: result as unknown as Record<string, unknown>,
      });

      return result;
    });
  }

  /** Выгрузка `.env` текущих значений. Массовое раскрытие — под журнал. */
  async exportEnv(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
  ): Promise<string> {
    return this.db.transaction(async (tx) => {
      const list = await this.repository.list(subject, projectId, environmentId, tx);

      const pairs = [];

      for (const variable of list) {
        const revealed = await this.repository.reveal(
          subject,
          projectId,
          environmentId,
          variable.id,
          tx,
        );
        pairs.push({ key: variable.key, value: revealed.value });
      }

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.VariablesExported,
        entityType: 'environment',
        entityId: environmentId,
        projectId,
        metadata: { keys: list.map((variable) => variable.key), count: list.length },
      });

      return serializeEnv(pairs);
    });
  }

  /** След раскрытия: ключ и номер версии, без значения. */
  private async recordReveal(
    tx: Parameters<AuditService['record']>[0],
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
    variableId: string,
    revealed: { key: string; versionNo: number },
  ): Promise<void> {
    await this.audit.record(tx, actorOf(subject), {
      action: AuditAction.VariableRevealed,
      entityType: 'variable',
      entityId: variableId,
      projectId,
      metadata: { key: revealed.key, environmentId, versionNo: revealed.versionNo },
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
