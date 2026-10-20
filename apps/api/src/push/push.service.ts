import {
  AuditSubjectKind,
  SubjectKind,
  type PushKeyResponse,
  type PushSubscribeRequest,
} from '@cairn/shared';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { PushRepository } from './push.repository';

/**
 * Подписки устройств: заведение, снятие, публичный ключ.
 *
 * Уровень доступа к проектам здесь не проверяется: подписка ничего не
 * раскрывает, а что по ней придёт, решает уведомитель в момент отправки.
 * Проверяется вид субъекта — у токена агента и приёмного адреса браузера
 * нет, и строка подписки у них была бы мёртвой.
 */
@Injectable()
export class PushService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly subscriptions: PushRepository,
    private readonly audit: AuditService,
  ) {}

  /**
   * Публичный VAPID-ключ. `null` — уведомления выключены.
   *
   * Проверяются все три переменные, а не одна публичная: транспорт без
   * `CAIRN_VAPID_SUBJECT` не собирается, и отдать ключ значило бы
   * показать кнопку, по которой человек подпишется, а отправка молча
   * ничего не сделает.
   */
  publicKey(): PushKeyResponse {
    const publicKey = process.env.CAIRN_VAPID_PUBLIC_KEY;
    const isConfigured = Boolean(
      publicKey && process.env.CAIRN_VAPID_PRIVATE_KEY && process.env.CAIRN_VAPID_SUBJECT,
    );

    return { publicKey: isConfigured ? publicKey! : null };
  }

  /** Заводит подписку устройства и пишет действие в журнал. */
  async subscribe(subject: RequestSubject, input: PushSubscribeRequest): Promise<void> {
    requireHuman(subject);

    await this.db.transaction(async (tx) => {
      await this.subscriptions.save(subject.id, input, tx);
      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.PushSubscribed,
        entityType: 'push_subscription',
      });
    });
  }

  /** Снимает подписку устройства и пишет действие в журнал. */
  async unsubscribe(subject: RequestSubject, endpoint: string): Promise<void> {
    requireHuman(subject);

    await this.db.transaction(async (tx) => {
      await this.subscriptions.remove(subject.id, endpoint, tx);
      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.PushUnsubscribed,
        entityType: 'push_subscription',
      });
    });
  }
}

/** Пускает к подпискам только человека. */
function requireHuman(subject: RequestSubject): void {
  if (subject.kind !== SubjectKind.User) {
    throw new ForbiddenException('Подписка на уведомления — только для людей');
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
