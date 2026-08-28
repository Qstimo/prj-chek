import {
  AccessLevel,
  Section,
  type RevealResponse,
  type Variable,
  type VariableCreate,
  type VariableVersion,
  type VariablesEnvironment,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, max } from 'drizzle-orm';

import { SectionNotVisibleError } from '../access/access.errors';
import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { CryptoService } from '../crypto/crypto.service';
import { DATABASE } from '../db/db.module';
import type { Database, Executor, Transaction } from '../db/db.types';
import {
  environments,
  subjects,
  variableVersions,
  variables,
  type VariableRow,
} from '../db/schema';

/**
 * Доступ к переменным окружений (ТЗ 3.3).
 *
 * Единственное место, где значения шифруются и расшифровываются.
 * Наружу открытое значение выходит только из методов `reveal*`;
 * список не содержит значений ни на одном уровне доступа.
 *
 * Каждый метод принимает субъект первым аргументом и проверяет права сам
 * (спека 5.4). Принадлежность «проект → окружение → переменная» сверяется
 * в самих запросах: чужое выглядит несуществующим.
 */
@Injectable()
export class VariablesRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly access: AccessService,
    private readonly crypto: CryptoService,
  ) {}

  /** Список переменных окружения: ключи, описания, номера версий — без значений. */
  async list(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
  ): Promise<Variable[]> {
    await this.access.requireLevel(subject, projectId, Section.Variables, AccessLevel.Metadata);
    await this.requireEnvironment(this.db, projectId, environmentId);

    const rows = await this.db
      .select({
        variable: variables,
        currentVersion: max(variableVersions.versionNo),
      })
      .from(variables)
      .innerJoin(variableVersions, eq(variableVersions.variableId, variables.id))
      .where(eq(variables.environmentId, environmentId))
      .groupBy(variables.id)
      .orderBy(asc(variables.key));

    return rows.map((row) => ({
      id: row.variable.id,
      key: row.variable.key,
      description: row.variable.description,
      currentVersion: row.currentVersion ?? 1,
      createdAt: row.variable.createdAt.toISOString(),
      updatedAt: row.variable.updatedAt.toISOString(),
    }));
  }

  /**
   * Окружения проекта для переключателя страницы переменных.
   *
   * Требует уровня на секции «Переменные», а не «Инфраструктура»:
   * уровни выдаются независимо, и доступ к переменным не должен
   * зависеть от доступа к серверным параметрам (спека 7).
   */
  async listEnvironments(
    subject: RequestSubject,
    projectId: string,
  ): Promise<VariablesEnvironment[]> {
    await this.access.requireLevel(subject, projectId, Section.Variables, AccessLevel.Metadata);

    const rows = await this.db
      .select({ id: environments.id, name: environments.name, kind: environments.kind })
      .from(environments)
      .where(eq(environments.projectId, projectId))
      .orderBy(asc(environments.kind), asc(environments.name));

    return rows;
  }

  /** Создаёт переменную с первой версией значения. */
  async create(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    environmentId: string,
    input: VariableCreate,
  ): Promise<VariableRow> {
    await this.access.requireLevel(subject, projectId, Section.Variables, AccessLevel.Write, tx);
    await this.requireEnvironment(tx, projectId, environmentId);

    const [created] = await tx
      .insert(variables)
      .values({
        environmentId,
        key: input.key,
        description: input.description ?? null,
      })
      .returning();

    await tx.insert(variableVersions).values({
      variableId: created!.id,
      versionNo: 1,
      valueEncrypted: this.crypto.encrypt(input.value),
      createdBySubjectId: subject.id,
    });

    return created!;
  }

  /** Правит паспорт переменной: ключ и описание. Версий не создаёт. */
  async updateMeta(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    environmentId: string,
    variableId: string,
    input: { key?: string; description?: string | null },
  ): Promise<VariableRow> {
    await this.access.requireLevel(subject, projectId, Section.Variables, AccessLevel.Write, tx);
    await this.requireVariable(tx, projectId, environmentId, variableId);

    const [updated] = await tx
      .update(variables)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(variables.id, variableId))
      .returning();

    return updated!;
  }

  /**
   * Добавляет новую версию значения.
   *
   * Возвращает её номер либо `null`, если значение не изменилось:
   * плодить одинаковые версии значило бы засорять историю при каждом
   * импорте одного и того же файла.
   */
  async appendVersion(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    environmentId: string,
    variableId: string,
    value: string,
  ): Promise<number | null> {
    await this.access.requireLevel(subject, projectId, Section.Variables, AccessLevel.Write, tx);
    await this.requireVariable(tx, projectId, environmentId, variableId);

    const current = await this.currentVersion(tx, variableId);

    if (this.crypto.decrypt(current.valueEncrypted) === value) {
      return null;
    }

    const versionNo = current.versionNo + 1;

    await tx.insert(variableVersions).values({
      variableId,
      versionNo,
      valueEncrypted: this.crypto.encrypt(value),
      createdBySubjectId: subject.id,
    });
    await tx.update(variables).set({ updatedAt: new Date() }).where(eq(variables.id, variableId));

    return versionNo;
  }

  /** Откат: новая версия со значением версии `toVersion`. История не переписывается. */
  async rollback(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    environmentId: string,
    variableId: string,
    toVersion: number,
  ): Promise<number> {
    await this.access.requireLevel(subject, projectId, Section.Variables, AccessLevel.Write, tx);
    await this.requireVariable(tx, projectId, environmentId, variableId);

    const [target] = await tx
      .select()
      .from(variableVersions)
      .where(
        and(
          eq(variableVersions.variableId, variableId),
          eq(variableVersions.versionNo, toVersion),
        ),
      )
      .limit(1);

    if (!target) {
      throw new SectionNotVisibleError();
    }

    const current = await this.currentVersion(tx, variableId);
    const versionNo = current.versionNo + 1;

    // Значение перешифровывается с новым nonce: копия шифротекста связывала бы
    // версии между собой даже без раскрытия.
    await tx.insert(variableVersions).values({
      variableId,
      versionNo,
      valueEncrypted: this.crypto.encrypt(this.crypto.decrypt(target.valueEncrypted)),
      createdBySubjectId: subject.id,
    });
    await tx.update(variables).set({ updatedAt: new Date() }).where(eq(variables.id, variableId));

    return versionNo;
  }

  /** Удаляет переменную вместе с версиями — явными строками, без каскада. */
  async remove(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    environmentId: string,
    variableId: string,
  ): Promise<VariableRow> {
    await this.access.requireLevel(subject, projectId, Section.Variables, AccessLevel.Write, tx);

    const variable = await this.requireVariable(tx, projectId, environmentId, variableId);

    await tx.delete(variableVersions).where(eq(variableVersions.variableId, variableId));
    await tx.delete(variables).where(eq(variables.id, variableId));

    return variable;
  }

  /** Раскрывает текущее значение. Требует уровня чтения (ТЗ 4.3). */
  async reveal(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
    variableId: string,
    executor: Executor = this.db,
  ): Promise<RevealResponse> {
    await this.access.requireLevel(
      subject,
      projectId,
      Section.Variables,
      AccessLevel.Read,
      executor,
    );
    await this.requireVariable(executor, projectId, environmentId, variableId);

    const current = await this.currentVersion(executor, variableId);

    return { value: this.crypto.decrypt(current.valueEncrypted), versionNo: current.versionNo };
  }

  /** Раскрывает историческую версию. */
  async revealVersion(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
    variableId: string,
    versionNo: number,
    executor: Executor = this.db,
  ): Promise<RevealResponse> {
    await this.access.requireLevel(
      subject,
      projectId,
      Section.Variables,
      AccessLevel.Read,
      executor,
    );
    await this.requireVariable(executor, projectId, environmentId, variableId);

    const [version] = await executor
      .select()
      .from(variableVersions)
      .where(
        and(eq(variableVersions.variableId, variableId), eq(variableVersions.versionNo, versionNo)),
      )
      .limit(1);

    if (!version) {
      throw new SectionNotVisibleError();
    }

    return { value: this.crypto.decrypt(version.valueEncrypted), versionNo };
  }

  /** История версий без значений: номер, автор, дата. Новые сверху. */
  async versions(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
    variableId: string,
  ): Promise<VariableVersion[]> {
    await this.access.requireLevel(subject, projectId, Section.Variables, AccessLevel.Read);
    await this.requireVariable(this.db, projectId, environmentId, variableId);

    const rows = await this.db
      .select({
        versionNo: variableVersions.versionNo,
        createdAt: variableVersions.createdAt,
        createdByLabel: subjects.label,
      })
      .from(variableVersions)
      .innerJoin(subjects, eq(subjects.id, variableVersions.createdBySubjectId))
      .where(eq(variableVersions.variableId, variableId))
      .orderBy(desc(variableVersions.versionNo));

    return rows.map((row) => ({
      versionNo: row.versionNo,
      createdAt: row.createdAt.toISOString(),
      createdByLabel: row.createdByLabel,
    }));
  }

  /** Текущая версия — с наибольшим номером. */
  private async currentVersion(executor: Executor, variableId: string) {
    const [version] = await executor
      .select()
      .from(variableVersions)
      .where(eq(variableVersions.variableId, variableId))
      .orderBy(desc(variableVersions.versionNo))
      .limit(1);

    if (!version) {
      // Переменная без версий невозможна при создании через репозиторий.
      throw new SectionNotVisibleError();
    }

    return version;
  }

  /** Окружение обязано принадлежать проекту из адреса. */
  private async requireEnvironment(
    executor: Executor,
    projectId: string,
    environmentId: string,
  ): Promise<void> {
    const [environment] = await executor
      .select({ id: environments.id })
      .from(environments)
      .where(and(eq(environments.id, environmentId), eq(environments.projectId, projectId)))
      .limit(1);

    if (!environment) {
      throw new SectionNotVisibleError();
    }
  }

  /** Переменная обязана принадлежать окружению и проекту из адреса. */
  private async requireVariable(
    executor: Executor,
    projectId: string,
    environmentId: string,
    variableId: string,
  ): Promise<VariableRow> {
    const [row] = await executor
      .select({ variable: variables })
      .from(variables)
      .innerJoin(environments, eq(environments.id, variables.environmentId))
      .where(
        and(
          eq(variables.id, variableId),
          eq(variables.environmentId, environmentId),
          eq(environments.projectId, projectId),
        ),
      )
      .limit(1);

    if (!row) {
      throw new SectionNotVisibleError();
    }

    return row.variable;
  }
}
