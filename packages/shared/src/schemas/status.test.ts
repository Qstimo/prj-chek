import { describe, expect, it } from 'vitest';

import { StatusIndicator } from '../enums';
import { projectStatusSchema, statusSummaryRowSchema } from './status';

describe('схема статуса проекта', () => {
  it('принимает собранный агрегат', () => {
    const parsed = projectStatusSchema.parse({
      indicator: StatusIndicator.Warning,
      environments: [
        {
          environmentId: '11111111-1111-1111-1111-111111111111',
          name: 'Прод',
          health: 'up',
          latencyMs: 42,
          error: null,
          checkedAt: '2026-08-28T10:00:00.000Z',
        },
      ],
      domains: [
        {
          domainId: '22222222-2222-2222-2222-222222222222',
          name: 'example.com',
          tlsValidTo: null,
          tlsError: 'нет соединения',
          registryExpiresAt: '2026-09-20T00:00:00.000Z',
          registryError: null,
          checkedAt: '2026-08-28T10:00:00.000Z',
        },
      ],
      warnings: [{ kind: 'tls_error', subject: 'example.com', detail: 'нет соединения' }],
    });

    expect(parsed.indicator).toBe(StatusIndicator.Warning);
  });

  it('непроверенное окружение выражается null-полями', () => {
    const parsed = projectStatusSchema.parse({
      indicator: StatusIndicator.Unknown,
      environments: [
        {
          environmentId: '11111111-1111-1111-1111-111111111111',
          name: 'Прод',
          health: null,
          latencyMs: null,
          error: null,
          checkedAt: null,
        },
      ],
      domains: [],
      warnings: [],
    });

    expect(parsed.environments[0]!.health).toBeNull();
  });

  it('отвергает индикатор вне перечисления', () => {
    expect(() =>
      statusSummaryRowSchema.parse({
        projectId: '11111111-1111-1111-1111-111111111111',
        indicator: 'blinking',
        warnings: [],
      }),
    ).toThrow();
  });
});
