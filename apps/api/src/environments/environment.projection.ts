import {
  AccessLevel,
  type EnvironmentDetail,
  type EnvironmentMetadata,
} from '@cairn/shared';

import { projectByLevel } from '../access/projection';
import type { Environment } from '../db/schema';

/**
 * Приводит окружение к набору полей, разрешённому уровнем доступа (ТЗ 4.3).
 *
 * Домены отнесены к метаданным вместе с именем и видом: домен — публичный
 * адрес окружения, видимый любому, кто откроет сайт. IP, провайдер и
 * характеристики к публично наблюдаемому не относятся.
 */
export function environmentProjection(
  environment: Environment,
  domains: string[],
  level: AccessLevel,
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
      host: environment.host,
      ip: environment.ip,
      provider: environment.provider,
      specs: environment.specs,
      healthCheckUrl: environment.healthCheckUrl,
      notes: environment.notes,
      createdAt: environment.createdAt.toISOString(),
      updatedAt: environment.updatedAt.toISOString(),
    }),
  );
}
