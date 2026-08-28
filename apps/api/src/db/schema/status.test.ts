import { HealthState } from '@cairn/shared';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { domainStatuses, environmentStatuses, healthStateEnum } from './status';

describe('статусы окружений', () => {
  it('перечисление совпадает с контрактом', () => {
    expect(healthStateEnum.enumValues).toEqual(Object.values(HealthState));
  });

  it('у окружения не больше одной строки статуса', () => {
    const unique = getTableConfig(environmentStatuses).uniqueConstraints.find(
      (constraint) => constraint.name === 'environment_statuses_environment',
    );

    expect(unique?.columns.map((column) => column.name)).toEqual(['environment_id']);
  });
});

describe('статусы доменов', () => {
  it('у домена не больше одной строки статуса', () => {
    const unique = getTableConfig(domainStatuses).uniqueConstraints.find(
      (constraint) => constraint.name === 'domain_statuses_domain',
    );

    expect(unique?.columns.map((column) => column.name)).toEqual(['domain_id']);
  });
});
