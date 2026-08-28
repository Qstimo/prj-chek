import { AccessLevel, AuditSubjectKind, Section, SubjectKind } from '@cairn/shared';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { generateToken } from '../auth/token';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { grants, subjects, users } from '../db/schema';

/** Разрешённый приёмный адрес: субъект и его проект. */
export interface ResolvedIntake {
  subject: RequestSubject;
  projectId: string;
}

/**
 * Приёмный канал (ТЗ 5): адрес проекта как машинный субъект.
 *
 * Адрес — не отдельная сущность, а субъект вида `intake_address` с обычной
 * выдачей «хроника × запись». Привязка к проекту читается из выдачи,
 * отзыв гасит канал штатным механизмом отзыва субъекта.
 *
 * Токен хранится открыто в `label`: его нужно показывать пишущим, и он же
 * станет локальной частью почтового адреса. Утечка раскрывает лишь право
 * писать в хронику; перебор невозможен — 32 байта случайности.
 */
@Injectable()
export class IntakeService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /** Создаёт адрес проекта. У проекта не больше одного действующего адреса. */
  async createAddress(actor: RequestSubject, projectId: string): Promise<string> {
    if (await this.findAddress(projectId)) {
      throw new ConflictException(
        'У проекта уже есть приёмный адрес. Сначала отзовите действующий.',
      );
    }

    const token = generateToken();
    const grantedBy = await this.userIdOf(actor);

    await this.db.transaction(async (tx) => {
      const [subject] = await tx
        .insert(subjects)
        .values({ kind: SubjectKind.IntakeAddress, label: token })
        .returning();

      await tx.insert(grants).values({
        subjectId: subject!.id,
        projectId,
        section: Section.Chronicle,
        level: AccessLevel.Write,
        grantedBy,
      });

      await this.audit.record(tx, actorOf(actor), {
        action: AuditAction.IntakeAddressCreated,
        entityType: 'intake_address',
        entityId: subject!.id,
        projectId,
      });
    });

    return token;
  }

  /** Возвращает токен действующего адреса проекта либо `null`. */
  async findAddress(projectId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ label: subjects.label })
      .from(subjects)
      .innerJoin(grants, eq(grants.subjectId, subjects.id))
      .where(
        and(
          eq(subjects.kind, SubjectKind.IntakeAddress),
          isNull(subjects.revokedAt),
          eq(grants.projectId, projectId),
          eq(grants.section, Section.Chronicle),
        ),
      )
      .limit(1);

    return row?.label ?? null;
  }

  /** Отзывает действующий адрес проекта. */
  async revokeAddress(actor: RequestSubject, projectId: string): Promise<void> {
    const token = await this.findAddress(projectId);

    if (!token) {
      throw new NotFoundException('У проекта нет действующего приёмного адреса');
    }

    await this.db.transaction(async (tx) => {
      const [revoked] = await tx
        .update(subjects)
        .set({ revokedAt: new Date() })
        .where(and(eq(subjects.label, token), eq(subjects.kind, SubjectKind.IntakeAddress)))
        .returning();

      await this.audit.record(tx, actorOf(actor), {
        action: AuditAction.IntakeAddressRevoked,
        entityType: 'intake_address',
        entityId: revoked!.id,
        projectId,
      });
    });
  }

  /**
   * Разрешает токен из адреса в субъект и проект.
   *
   * Мусорный токен, отозванный адрес и адрес без выдачи неразличимы:
   * все три — `null`, снаружи одинаковый `404` (спека 3.2).
   */
  async resolveToken(token: string): Promise<ResolvedIntake | null> {
    const [row] = await this.db
      .select({ subject: subjects, projectId: grants.projectId })
      .from(subjects)
      .innerJoin(grants, eq(grants.subjectId, subjects.id))
      .where(
        and(
          eq(subjects.kind, SubjectKind.IntakeAddress),
          eq(subjects.label, token),
          isNull(subjects.revokedAt),
          eq(grants.section, Section.Chronicle),
        ),
      )
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      subject: {
        id: row.subject.id,
        kind: SubjectKind.IntakeAddress,
        label: row.subject.label,
        isSuperadmin: false,
        isRevoked: false,
      },
      projectId: row.projectId,
    };
  }

  /** Находит запись пользователя: поле «кто выдал» в выдаче ссылается на неё. */
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

/** Строит действующее лицо журнала из субъекта запроса. */
function actorOf(subject: RequestSubject): AuditActor {
  return {
    kind: subject.kind as unknown as Exclude<AuditSubjectKind, AuditSubjectKind.System>,
    id: subject.id,
    label: subject.label,
  };
}
