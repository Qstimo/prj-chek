import { z } from 'zod';

/**
 * Падение адреса как отрезок времени.
 *
 * Статус отвечает на вопрос «как сейчас», инцидент — «когда и сколько».
 * Пустой `resolvedAt` означает, что адрес не отвечает до сих пор, и он же
 * отвечает на вопрос «лежит с какого момента»: второй колонки для этого
 * не завели намеренно — она разошлась бы с инцидентом.
 */
export const incidentSchema = z.object({
  id: z.string().uuid(),
  domainId: z.string().uuid(),
  startedAt: z.string(),
  /** Пусто — инцидент открыт. */
  resolvedAt: z.string().nullable(),
  /** Причина на момент падения: «HTTP 500», «таймаут». */
  cause: z.string().nullable(),
});

/** Инциденты одного адреса: открытый отдельно от закрытых. */
export const addressIncidentsSchema = z.object({
  domainId: z.string().uuid(),
  name: z.string(),
  open: incidentSchema.nullable(),
  /** Закрытые, свежие первыми. Глубина ограничена сервером. */
  past: z.array(incidentSchema),
});

/** Инциденты адресов проекта. */
export const projectIncidentsSchema = z.array(addressIncidentsSchema);

/** Инцидент адреса. */
export type Incident = z.infer<typeof incidentSchema>;

/** Инциденты одного адреса. */
export type AddressIncidents = z.infer<typeof addressIncidentsSchema>;

/** Инциденты адресов проекта. */
export type ProjectIncidents = z.infer<typeof projectIncidentsSchema>;
