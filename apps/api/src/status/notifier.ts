import type { IncidentEvent } from '../incidents/incidents.service';

/**
 * Кому прогон отдаёт случившиеся события.
 *
 * Интерфейс, а не класс пушей: прогон не должен знать, чем именно
 * уведомляют. Второй канал — это второй поставщик этого токена, и
 * ни прогон, ни инциденты он не трогает.
 */
export interface IncidentNotifier {
  notify(events: IncidentEvent[]): Promise<void>;
}

/** Токен внедрения уведомителя. Не задан — рассылки нет. */
export const INCIDENT_NOTIFIER = Symbol('INCIDENT_NOTIFIER');
