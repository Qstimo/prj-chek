import {
  AccessLevel,
  AuditSubjectKind,
  Section,
  SubjectKind,
  type AgentToken,
  type AgentTokenCreate,
} from '@cairn/shared';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { generateToken, hashToken } from '../auth/token';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { agentTokens, grants, subjects, users, type AgentTokenRow } from '../db/schema';

/** Разрешённый токен: субъект, проект и флаг значений. */
export interface ResolvedAgent {
  subject: RequestSubject;
  projectId: string;
  canRevealVariables: boolean;
}

/**
 * Закрытый профиль токена по умолчанию (ТЗ 7.3): инфо, документация,
 * роадмап, хроника — чтение; переменные — метаданные; инфраструктура —
 * метаданные (список окружений и статус).
 */
const DEFAULT_AGENT_PROFILE: [Section, AccessLevel][] = [
  [Section.Info, AccessLevel.Read],
  [Section.Docs, AccessLevel.Read],
  [Section.Roadmap, AccessLevel.Read],
  [Section.Chronicle, AccessLevel.Read],
  [Section.Variables, AccessLevel.Metadata],
  [Section.Infrastructure, AccessLevel.Metadata],
];

/**
 * Токены агентов (ТЗ 7): машинные субъекты в общей модели прав.
 *
 * Создание заводит субъект и выдачи профиля в одной транзакции;
 * отзыв гасит субъект штатным `revoked_at` — все проверки прав
 * немедленно отказывают.
 */
@Injectable()
export class AgentTokensService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /** Создаёт токен. Открытое значение возвращается единственный раз. */
  async create(
    actor: RequestSubject,
    projectId: string,
    input: Required<AgentTokenCreate>,
  ): Promise<{ row: AgentTokenRow; token: string }> {
    const token = generateToken();
    const grantedBy = await this.userIdOf(actor);

    const row = await this.db.transaction(async (tx) => {
      const [subject] = await tx
        .insert(subjects)
        .values({ kind: SubjectKind.AgentToken, label: input.label })
        .returning();

      await tx.insert(grants).values(
        DEFAULT_AGENT_PROFILE.map(([section, level]) => ({
          subjectId: subject!.id,
          projectId,
          section,
          level,
          grantedBy,
        })),
      );

      const [created] = await tx
        .insert(agentTokens)
        .values({
          subjectId: subject!.id,
          projectId,
          label: input.label,
          tokenHash: hashToken(token),
          canRevealVariables: input.canRevealVariables,
          expiresAt: new Date(Date.now() + input.ttlDays * 24 * 60 * 60 * 1000),
        })
        .returning();

      await this.audit.record(tx, actorOf(actor), {
        action: AuditAction.AgentTokenCreated,
        entityType: 'agent_token',
        entityId: created!.id,
        projectId,
        metadata: { label: input.label, ttlDays: input.ttlDays },
      });

      return created!;
    });

    return { row, token };
  }

  /** Токены проекта: без хэшей и открытых значений. */
  async list(projectId: string): Promise<AgentToken[]> {
    const rows = await this.db
      .select()
      .from(agentTokens)
      .where(eq(agentTokens.projectId, projectId));

    return rows.map(toView);
  }

  /** Переключает доступ к значениям переменных (ТЗ 7.3). */
  async setRevealFlag(
    actor: RequestSubject,
    projectId: string,
    tokenId: string,
    value: boolean,
  ): Promise<AgentToken> {
    const row = await this.requireToken(projectId, tokenId);

    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(agentTokens)
        .set({ canRevealVariables: value })
        .where(eq(agentTokens.id, row.id))
        .returning();

      await this.audit.record(tx, actorOf(actor), {
        action: AuditAction.AgentTokenUpdated,
        entityType: 'agent_token',
        entityId: row.id,
        projectId,
        metadata: { label: row.label, canRevealVariables: value },
      });

      return toView(updated!);
    });
  }

  /** Отзывает токен: гасит субъект — все права отказывают немедленно. */
  async revoke(actor: RequestSubject, projectId: string, tokenId: string): Promise<void> {
    const row = await this.requireToken(projectId, tokenId);

    await this.db.transaction(async (tx) => {
      await tx
        .update(subjects)
        .set({ revokedAt: new Date() })
        .where(eq(subjects.id, row.subjectId));

      await this.audit.record(tx, actorOf(actor), {
        action: AuditAction.AgentTokenRevoked,
        entityType: 'agent_token',
        entityId: row.id,
        projectId,
        metadata: { label: row.label },
      });
    });
  }

  /**
   * Аутентификация по токену: живой субъект и непросроченный срок.
   *
   * Мусорный, отозванный и просроченный токены неразличимы — `null`.
   */
  async authenticate(token: string): Promise<ResolvedAgent | null> {
    const [row] = await this.db
      .select({ agentToken: agentTokens, subject: subjects })
      .from(agentTokens)
      .innerJoin(subjects, eq(subjects.id, agentTokens.subjectId))
      .where(and(eq(agentTokens.tokenHash, hashToken(token)), isNull(subjects.revokedAt)))
      .limit(1);

    if (!row || row.agentToken.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    await this.db
      .update(agentTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(agentTokens.id, row.agentToken.id));

    return {
      subject: {
        id: row.subject.id,
        kind: SubjectKind.AgentToken,
        label: row.subject.label,
        isSuperadmin: false,
        isRevoked: false,
      },
      projectId: row.agentToken.projectId,
      canRevealVariables: row.agentToken.canRevealVariables,
    };
  }

  /** Токен обязан принадлежать проекту из адреса. */
  private async requireToken(projectId: string, tokenId: string): Promise<AgentTokenRow> {
    const [row] = await this.db
      .select()
      .from(agentTokens)
      .where(and(eq(agentTokens.id, tokenId), eq(agentTokens.projectId, projectId)))
      .limit(1);

    if (!row) {
      throw new NotFoundException('Токен не найден');
    }

    return row;
  }

  /** Находит запись пользователя: «кто выдал» в выдачах ссылается на неё. */
  private async userIdOf(subject: RequestSubject): Promise<string> {
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.subjectId, subject.id))
      .limit(1);

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    return user.id;
  }
}

/** Представление токена без хэша. */
function toView(row: AgentTokenRow): AgentToken {
  return {
    id: row.id,
    label: row.label,
    canRevealVariables: row.canRevealVariables,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

/** Строит действующее лицо журнала из субъекта запроса. */
function actorOf(subject: RequestSubject): AuditActor {
  return {
    kind: subject.kind as unknown as Exclude<AuditSubjectKind, AuditSubjectKind.System>,
    id: subject.id,
    label: subject.label,
  };
}
