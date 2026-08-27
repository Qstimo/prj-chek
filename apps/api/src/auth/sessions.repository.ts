import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';

import { DATABASE } from '../db/db.module';
import type { Database, Executor } from '../db/db.types';
import { sessions, type Session } from '../db/schema';
import { generateToken, hashToken } from './token';

/** Сведения об источнике запроса, сохраняемые в сессии. */
export interface SessionOrigin {
  ip?: string;
  userAgent?: string;
}

/**
 * Сессии пользователей.
 *
 * Хранятся в базе ради мгновенного отзыва: для системы с секретами
 * отозвать доступ нужно немедленно (спека 4.5).
 */
@Injectable()
export class SessionsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Создаёт сессию и возвращает токен в открытом виде.
   *
   * Открытый токен существует только в этом возвращаемом значении и в cookie
   * браузера; в базу попадает лишь его хэш.
   */
  async create(
    tx: Executor,
    subjectId: string,
    origin: SessionOrigin,
    expiresAt: Date = new Date(Date.now() + SESSION_TTL_MS),
  ): Promise<string> {
    const token = generateToken();

    await tx.insert(sessions).values({
      subjectId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: origin.ip ?? null,
      userAgent: origin.userAgent ?? null,
    });

    return token;
  }

  /** Находит живую сессию по токену: не отозванную и не истёкшую. */
  async findActive(token: string): Promise<Session | null> {
    const [session] = await this.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.tokenHash, hashToken(token)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    return session ?? null;
  }

  /** Отзывает одну сессию. */
  async revoke(tx: Executor, token: string): Promise<void> {
    await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt)));
  }

  /**
   * Отзывает все живые сессии субъекта и возвращает их число.
   *
   * Число попадает в журнал: без него из записи не видно, был ли у
   * отозванного субъекта активный доступ в момент отзыва (спека 7.2).
   */
  async revokeAllForSubject(tx: Executor, subjectId: string): Promise<number> {
    const revoked = await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.subjectId, subjectId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });

    return revoked.length;
  }

  /**
   * Отмечает активность сессии.
   *
   * Обновление реже раза в минуту: писать в базу на каждом запросе
   * ради поля «последняя активность» не стоит.
   */
  async touch(sessionId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(
        and(
          eq(sessions.id, sessionId),
          sql`${sessions.lastSeenAt} < now() - interval '1 minute'`,
        ),
      );
  }
}

/** Срок жизни сессии — 30 дней (спека 4.5). */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
