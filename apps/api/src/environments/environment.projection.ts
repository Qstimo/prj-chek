import {
  AccessLevel,
  type EnvironmentDetail,
  type EnvironmentMetadata,
} from '@cairn/shared';

import { projectByLevel } from '../access/projection';
import type { Environment, Server } from '../db/schema';

/**
 * Приводит окружение к набору полей, разрешённому уровнем доступа (ТЗ 4.3).
 *
 * Домены отнесены к метаданным вместе с именем и видом: домен — публичный
 * адрес окружения, видимый любому, кто откроет сайт. Машина, её владелец
 * и характеристики к публично наблюдаемому не относятся.
 *
 * Машина приходит вложенным объектом и только на уровне чтения. Срок её
 * оплаты и заметки не отдаются никогда: это данные реестра серверов,
 * а список соседей по машине не раскрывается тем более.
 */
export function environmentProjection(
  environment: Environment,
  domains: string[],
  level: AccessLevel,
  server: Server | null,
): EnvironmentMetadata | EnvironmentDetail {
  return projectByLevel(
    level,
    {
      id: environment.id,
      name: environment.name,
      kind: environment.kind,
      domains,
    },
    () => ({
      healthCheckPath: environment.healthCheckPath,
      notes: environment.notes,
      server: server
        ? {
            id: server.id,
            name: server.name,
            owner: server.owner,
            host: server.host,
            ip: server.ip,
            provider: server.provider,
            specs: server.specs,
          }
        : null,
      createdAt: environment.createdAt.toISOString(),
      updatedAt: environment.updatedAt.toISOString(),
    }),
  );
}
