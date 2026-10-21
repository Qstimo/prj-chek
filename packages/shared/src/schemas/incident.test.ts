import { describe, expect, it } from 'vitest';

import { addressIncidentsSchema, incidentSchema } from './incident';

describe('схема инцидента', () => {
  it('принимает открытый инцидент', () => {
    const parsed = incidentSchema.parse({
      id: '00000000-0000-0000-0000-000000000001',
      domainId: '00000000-0000-0000-0000-000000000002',
      startedAt: '2026-10-20T10:00:00.000Z',
      resolvedAt: null,
      cause: 'HTTP 500',
    });

    expect(parsed.resolvedAt).toBeNull();
  });

  it('принимает инцидент без причины', () => {
    // Причина — данные проверки: её может не быть, а инцидент есть.
    expect(() =>
      incidentSchema.parse({
        id: '00000000-0000-0000-0000-000000000001',
        domainId: '00000000-0000-0000-0000-000000000002',
        startedAt: '2026-10-20T10:00:00.000Z',
        resolvedAt: '2026-10-20T10:40:00.000Z',
        cause: null,
      }),
    ).not.toThrow();
  });

  it('отвергает инцидент без момента начала', () => {
    expect(() =>
      incidentSchema.parse({
        id: '00000000-0000-0000-0000-000000000001',
        domainId: '00000000-0000-0000-0000-000000000002',
        resolvedAt: null,
        cause: null,
      }),
    ).toThrow();
  });

  it('у адреса открытый инцидент отделён от закрытых', () => {
    const parsed = addressIncidentsSchema.parse({
      domainId: '00000000-0000-0000-0000-000000000002',
      name: 'project.ru',
      open: null,
      past: [],
    });

    expect(parsed).toEqual({
      domainId: '00000000-0000-0000-0000-000000000002',
      name: 'project.ru',
      open: null,
      past: [],
    });
  });
});
