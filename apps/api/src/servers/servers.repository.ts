import {
  type ServerCreate,
  type ServerMap,
  type ServerDetail,
  type ServerRow,
  type ServerUpdate,
} from '@cairn/shared';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, inArray, isNotNull } from 'drizzle-orm';

import { DATABASE } from '../db/db.module';
import type { Database, Transaction } from '../db/db.types';
import {
  environmentStatuses,
  environments,
  projects,
  servers,
  type Server,
} from '../db/schema';
import { serverIndicatorOf, serverWarningsOf } from '../status/indicator';
import { buildServerMap } from './server-map';

/** Строка размещения: окружение на сервере вместе с проектом и здоровьем. */
interface PlacementRow {
  serverId: string;
  environmentId: string;
  environmentName: string;
  environmentKind: (typeof environments.kind)['_']['data'];
  projectId: string;
  projectName: string;
  health: (typeof environmentStatuses.health)['_']['data'] | null;
}

/**
 * Доступ к серверам реестра.
 *
 * Субъекта в сигнатуре нет — в отличие от всех остальных репозиториев.
 * Причина не в забывчивости: сервер межпроектен, выдачи на него не бывает,
 * и проверять здесь нечего. Доступ закрыт правом суперадмина на уровне
 * контроллера, как у пользователей и журнала (спека 3).
 */
@Injectable()
export class ServersRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Реестр серверов с агрегированным статусом и счётчиками. */
  async list(): Promise<ServerRow[]> {
    const rows = await this.db.select().from(servers).orderBy(asc(servers.name));
    const placements = await this.placementsOf(rows.map((row) => row.id));
    const now = new Date();

    return rows.map((row) => this.rowOf(row, placements.get(row.id) ?? [], now));
  }

  /** Сервер вместе с тем, что на нём живёт. */
  async findById(id: string): Promise<ServerDetail> {
    const server = await this.requireServer(this.db, id);
    const placements = (await this.placementsOf([id])).get(id) ?? [];

    return {
      ...this.rowOf(server, placements, new Date()),
      environments: placements.map((placement) => ({
        id: placement.environmentId,
        name: placement.environmentName,
        kind: placement.environmentKind,
        projectId: placement.projectId,
        projectName: placement.projectName,
        health: placement.health,
      })),
    };
  }

  /**
   * Данные карты размещения.
   *
   * Один запрос за размещениями и один за машинами: узлов десятки,
   * и усложнять выборку ради них незачем.
   */
  async map(): Promise<ServerMap> {
    const machines = await this.db.select().from(servers).orderBy(asc(servers.name));

    const placements = await this.db
      .select({
        serverId: environments.serverId,
        environmentId: environments.id,
        environmentName: environments.name,
        environmentKind: environments.kind,
        projectId: projects.id,
        projectName: projects.name,
        projectLifecycle: projects.lifecycle,
        health: environmentStatuses.health,
      })
      .from(environments)
      .innerJoin(projects, eq(projects.id, environments.projectId))
      .leftJoin(environmentStatuses, eq(environmentStatuses.environmentId, environments.id))
      .where(isNotNull(environments.serverId))
      .orderBy(asc(projects.name), asc(environments.name));

    return buildServerMap(
      {
        servers: machines,
        placements: placements.map((placement) => ({ ...placement, serverId: placement.serverId! })),
      },
      new Date(),
    );
  }

  /** Заводит сервер. */
  async create(tx: Transaction, input: ServerCreate): Promise<Server> {
    await this.requireFreeName(tx, input.name);

    const [created] = await tx
      .insert(servers)
      .values({ ...input, name: input.name })
      .returning();

    return created!;
  }

  /** Меняет поля сервера. */
  async update(tx: Transaction, id: string, input: ServerUpdate): Promise<Server> {
    await this.requireServer(tx, id);

    if (input.name !== undefined) {
      await this.requireFreeName(tx, input.name, id);
    }

    const [updated] = await tx
      .update(servers)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(servers.id, id))
      .returning();

    return updated!;
  }

  /** Удаляет сервер. Занятый сервер удалить нельзя. */
  async remove(tx: Transaction, id: string): Promise<Server> {
    const server = await this.requireServer(tx, id);

    const [occupant] = await tx
      .select({ id: environments.id })
      .from(environments)
      .where(eq(environments.serverId, id))
      .limit(1);

    if (occupant) {
      throw new ConflictException('На сервере есть окружения. Сначала перенесите их.');
    }

    await tx.delete(servers).where(eq(servers.id, id));

    return server;
  }

  /** Собирает строку реестра: статус считается из размещённых окружений. */
  private rowOf(server: Server, placements: PlacementRow[], now: Date): ServerRow {
    const environmentStatusesView = placements.map((placement) => ({
      environmentId: placement.environmentId,
      name: placement.environmentName,
      health: placement.health,
      latencyMs: null,
      error: null,
      checkedAt: null,
    }));

    return {
      id: server.id,
      name: server.name,
      owner: server.owner,
      host: server.host,
      ip: server.ip,
      provider: server.provider,
      specs: server.specs,
      paidUntil: server.paidUntil,
      notes: server.notes,
      indicator: serverIndicatorOf(environmentStatusesView, server.paidUntil, now),
      warnings: serverWarningsOf(server.name, server.paidUntil, now),
      projectCount: new Set(placements.map((placement) => placement.projectId)).size,
      environmentCount: placements.length,
      createdAt: server.createdAt.toISOString(),
      updatedAt: server.updatedAt.toISOString(),
    };
  }

  /** Что размещено на серверах: окружения с проектами и последним health. */
  private async placementsOf(serverIds: string[]): Promise<Map<string, PlacementRow[]>> {
    const grouped = new Map<string, PlacementRow[]>();

    if (serverIds.length === 0) {
      return grouped;
    }

    const rows = await this.db
      .select({
        serverId: environments.serverId,
        environmentId: environments.id,
        environmentName: environments.name,
        environmentKind: environments.kind,
        projectId: projects.id,
        projectName: projects.name,
        health: environmentStatuses.health,
      })
      .from(environments)
      .innerJoin(projects, eq(projects.id, environments.projectId))
      .leftJoin(environmentStatuses, eq(environmentStatuses.environmentId, environments.id))
      .where(inArray(environments.serverId, serverIds))
      .orderBy(asc(projects.name), asc(environments.name));

    for (const row of rows) {
      const key = row.serverId!;
      grouped.set(key, [...(grouped.get(key) ?? []), { ...row, serverId: key }]);
    }

    return grouped;
  }

  /** Возвращает сервер либо сообщает, что его нет. */
  private async requireServer(executor: Database | Transaction, id: string): Promise<Server> {
    const [server] = await executor.select().from(servers).where(eq(servers.id, id)).limit(1);

    if (!server) {
      throw new NotFoundException('Сервер не найден.');
    }

    return server;
  }

  /**
   * Проверяет, что имя свободно.
   *
   * Ограничение уникальности есть и в базе, но человеку нужен внятный
   * отказ, а не 500 от сырого нарушения ключа.
   */
  private async requireFreeName(
    tx: Transaction,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const [taken] = await tx
      .select({ id: servers.id })
      .from(servers)
      .where(eq(servers.name, name))
      .limit(1);

    if (taken && taken.id !== exceptId) {
      throw new ConflictException('Сервер с таким именем уже есть.');
    }
  }
}
