import type { PushSubscribeRequest } from '@cairn/shared';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import { DATABASE } from '../db/db.module';
import type { Database, Executor } from '../db/db.types';
import { pushSubscriptions } from '../db/schema';

/** Подписка в том виде, в каком её берёт отправитель. */
export interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Хранилище подписок на пуши (дизайн уведомлений, раздел 3).
 *
 * Проверки прав здесь нет намеренно: подписка ничего не раскрывает, а что
 * именно по ней придёт, решает проверка в уведомителе — в момент отправки,
 * а не в момент подписки. Поэтому потеря доступа гасит пуши сама собой.
 *
 * Запись принимает исполнителя: подписка и запись в журнал обязаны лечь
 * одной транзакцией, иначе журнал потеряет след действия.
 */
@Injectable()
export class PushRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Заводит подписку либо обновляет ключи своей существующей.
   *
   * Чужой адрес отвергается, а не переходит к новому владельцу: иначе
   * подсунутый endpoint начал бы слать на чужое устройство имена моих
   * проектов и адресов. Устройство, сменившее хозяина, браузер в любом
   * случае переподпишет с новым адресом.
   */
  async save(
    subjectId: string,
    input: PushSubscribeRequest,
    executor: Executor = this.db,
  ): Promise<void> {
    const [existing] = await executor
      .select({ subjectId: pushSubscriptions.subjectId })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, input.endpoint))
      .limit(1);

    if (existing && existing.subjectId !== subjectId) {
      throw new ConflictException('Этот адрес подписки принадлежит другому субъекту');
    }

    await executor
      .insert(pushSubscriptions)
      .values({ subjectId, ...input })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        // Свою подписку браузер пересоздаёт сам, когда служба меняет
        // ключи: обновляются именно они.
        set: { p256dh: input.p256dh, auth: input.auth },
      });
  }

  /** Снимает свою подписку. Чужую снять нельзя. */
  async remove(subjectId: string, endpoint: string, executor: Executor = this.db): Promise<void> {
    await executor
      .delete(pushSubscriptions)
      .where(
        and(eq(pushSubscriptions.subjectId, subjectId), eq(pushSubscriptions.endpoint, endpoint)),
      );
  }

  /** Подписки перечисленных субъектов. Пустой список — пустой ответ. */
  async forSubjects(subjectIds: string[]): Promise<StoredSubscription[]> {
    if (subjectIds.length === 0) {
      // `inArray` с пустым списком — отдельная ловушка: без этой проверки
      // падение проекта без адресатов ушло бы всем подряд.
      return [];
    }

    return this.db
      .select({
        id: pushSubscriptions.id,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.subjectId, subjectIds));
  }

  /** Удаляет мёртвую подписку: push-служба ответила «такой нет». */
  async drop(id: string): Promise<void> {
    await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
  }
}
