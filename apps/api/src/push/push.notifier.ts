import { AccessLevel, Section } from '@cairn/shared';
import { Injectable, Logger } from '@nestjs/common';

import { AccessService } from '../access/access.service';
import { IncidentEventKind, type IncidentEvent } from '../incidents/incidents.service';
import { STORM_THRESHOLD } from './constants';
import { notificationOf, stormNotificationOf } from './notification-text';
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
    // Виды разделены: двенадцать падений и одно восстановление — это
    // сводка о падениях и отдельное уведомление о восстановлении.
    // Сложить их в одно число значило бы соврать о каждом.
    for (const kind of [IncidentEventKind.Opened, IncidentEventKind.Resolved]) {
      const own = events.filter((event) => event.kind === kind);

      if (own.length === 0) {
        continue;
      }

      if (own.length > STORM_THRESHOLD) {
        try {
          await this.notifyStorm(kind, own);
        } catch (cause) {
          this.logger.warn(`Сводка о событиях вида ${kind} не ушла: ${cause}`);
        }

        continue;
      }

      for (const event of own) {
        try {
          await this.notifyOne(event);
        } catch (cause) {
          // Падение рассылки по одному событию не должно съедать остальные.
          this.logger.warn(`Уведомление об адресе ${event.address} не ушло: ${cause}`);
        }
      }
    }
  }

  /**
   * Одна сводка вместо многих уведомлений.
   *
   * Адресаты считаются пересечением: человек получает сводку, только
   * если видит «Инфраструктуру» хотя бы одного затронутого проекта, и
   * число в тексте — по его проектам, а не по всем упавшим. Иначе текст
   * раскрыл бы подрядчику масштаб аварии в чужих проектах.
   */
  private async notifyStorm(kind: IncidentEventKind, events: IncidentEvent[]): Promise<void> {
    const countBySubject = new Map<string, number>();
    const projectIds = [...new Set(events.map((event) => event.projectId))];

    for (const projectId of projectIds) {
      const subjectIds = await this.access.subjectsWithLevel(
        projectId,
        Section.Infrastructure,
        AccessLevel.Metadata,
      );
      const own = events.filter((event) => event.projectId === projectId).length;

      for (const subjectId of subjectIds) {
        countBySubject.set(subjectId, (countBySubject.get(subjectId) ?? 0) + own);
      }
    }

    for (const [subjectId, count] of countBySubject) {
      // Подписки берутся по одному субъекту: текст у каждого свой, и
      // общая выборка здесь ничего не сэкономила бы.
      await this.deliver(
        await this.subscriptions.forSubjects([subjectId]),
        JSON.stringify(stormNotificationOf(kind, count)),
      );
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
