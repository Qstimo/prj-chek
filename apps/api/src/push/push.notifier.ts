import { AccessLevel, Section } from '@cairn/shared';
import { Injectable, Logger } from '@nestjs/common';

import { AccessService } from '../access/access.service';
import type { IncidentEvent } from '../incidents/incidents.service';
import { notificationOf } from './notification-text';
import { PushRepository, type StoredSubscription } from './push.repository';
import { PushSender, SendOutcome } from './push.sender';

/**
 * Рассылка уведомлений об инцидентах (дизайн уведомлений, раздел 7).
 *
 * О проверках не знает ничего — только о событиях. Адресаты считаются в
 * момент отправки по выдачам: отдельного списка подписчиков на проект нет
 * намеренно, иначе он разошёлся бы с правами в первый же месяц.
 */
@Injectable()
export class PushNotifier {
  private readonly logger = new Logger(PushNotifier.name);

  constructor(
    private readonly access: AccessService,
    private readonly subscriptions: PushRepository,
    private readonly sender: PushSender,
  ) {}

  /** Рассылает события тем, кому виден статус их проекта. */
  async notify(events: IncidentEvent[]): Promise<void> {
    for (const event of events) {
      try {
        await this.notifyOne(event);
      } catch (cause) {
        // Падение рассылки по одному событию не должно съедать остальные.
        this.logger.warn(`Уведомление об адресе ${event.address} не ушло: ${cause}`);
      }
    }
  }

  /** Одно событие: адресаты, нагрузка, отправка. */
  private async notifyOne(event: IncidentEvent): Promise<void> {
    const subjectIds = await this.access.subjectsWithLevel(
      event.projectId,
      Section.Infrastructure,
      AccessLevel.Metadata,
    );
    const targets = await this.subscriptions.forSubjects(subjectIds);

    await this.deliver(targets, JSON.stringify(notificationOf(event)));
  }

  /**
   * Посылает одну нагрузку по списку подписок и убирает мёртвые.
   *
   * Общий для одиночных уведомлений и сводных: разойдясь, две копии
   * этого блока перестали бы убирать подписки в одной из ветвей.
   */
  private async deliver(targets: StoredSubscription[], payload: string): Promise<void> {
    for (const target of targets) {
      try {
        const outcome = await this.sender.send(target, payload);

        if (outcome === SendOutcome.Gone) {
          await this.subscriptions.drop(target.id);
        }
      } catch (cause) {
        // Отказ одной подписки не мешает остальным.
        this.logger.warn(`Подписка не обслужена: ${cause}`);
      }
    }
  }
}
