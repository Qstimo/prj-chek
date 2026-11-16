import { describe, expect, it } from 'vitest';

import {
  INCIDENT_PAGE_LIMIT,
  INCIDENT_WINDOW_DAYS,
  INCIDENT_WINDOW_MAX_DAYS,
  addressIncidentHistorySchema,
  addressIncidentsQuerySchema,
  addressIncidentsSchema,
  incidentSchema,
} from './incident';

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
      fallsInWindow: 0,
      windowDays: INCIDENT_WINDOW_DAYS,
    });

    expect(parsed.past).toEqual([]);
  });

  it('у адреса счёт падений назван вместе с окном', () => {
    // «Падал 3 раза» без окна — утверждение за всё время, а считается
    // окно: число и его окно обязаны ехать парой.
    expect(() =>
      addressIncidentsSchema.parse({
        domainId: '00000000-0000-0000-0000-000000000002',
        name: 'project.ru',
        open: null,
        past: [],
        fallsInWindow: 3,
      }),
    ).toThrow();
  });
});

describe('схема запроса истории адреса', () => {
  it('без параметров даёт окно и страницу по умолчанию', () => {
    expect(addressIncidentsQuerySchema.parse({})).toEqual({
      windowDays: INCIDENT_WINDOW_DAYS,
      limit: INCIDENT_PAGE_LIMIT,
      offset: 0,
    });
  });

  it('приводит строки адреса к числам', () => {
    // Параметры запроса приходят строками: без приведения окно стало бы
    // «30» и сравнение с числом сломалось бы молча.
    expect(addressIncidentsQuerySchema.parse({ windowDays: '7', limit: '5', offset: '10' })).toEqual(
      { windowDays: 7, limit: 5, offset: 10 },
    );
  });

  it('отвергает пустое и запредельное окно', () => {
    expect(() => addressIncidentsQuerySchema.parse({ windowDays: 0 })).toThrow();
    expect(() =>
      addressIncidentsQuerySchema.parse({ windowDays: INCIDENT_WINDOW_MAX_DAYS + 1 }),
    ).toThrow();
  });

  it('отвергает отрицательное смещение и нулевой предел', () => {
    expect(() => addressIncidentsQuerySchema.parse({ offset: -1 })).toThrow();
    expect(() => addressIncidentsQuerySchema.parse({ limit: 0 })).toThrow();
  });
});

describe('схема истории падений адреса', () => {
  const HISTORY = {
    domainId: '00000000-0000-0000-0000-000000000002',
    name: 'project.ru',
    window: { days: 30, from: '2026-10-17T12:00:00.000Z', to: '2026-11-16T12:00:00.000Z' },
    summary: { falls: 2, downSeconds: 5400, uptime: 0.997917 },
    open: null,
    incidents: [],
    offset: 0,
    limit: 20,
    nextOffset: null,
  };

  it('принимает сводку и страницу', () => {
    expect(addressIncidentHistorySchema.parse(HISTORY).summary.downSeconds).toBe(5400);
  });

  it('отвергает долю времени вне отрезка от нуля до единицы', () => {
    // Доля вычисляется, а не хранится: значение больше единицы означало бы
    // ошибку счёта пересечений, и наружу его выпускать нельзя.
    expect(() =>
      addressIncidentHistorySchema.parse({
        ...HISTORY,
        summary: { ...HISTORY.summary, uptime: 1.5 },
      }),
    ).toThrow();
  });

  it('смещение следующей страницы обнуляемо, а не необязательно', () => {
    // Пусто означает «страница последняя»; отсутствие поля не отличалось бы
    // от забытого поля.
    expect(() =>
      addressIncidentHistorySchema.parse({
        ...HISTORY,
        nextOffset: undefined,
      }),
    ).toThrow();
    expect(addressIncidentHistorySchema.parse({ ...HISTORY, nextOffset: 20 }).nextOffset).toBe(20);
  });

  it('отвергает отрицательное суммарное время падения', () => {
    expect(() =>
      addressIncidentHistorySchema.parse({
        ...HISTORY,
        summary: { ...HISTORY.summary, downSeconds: -1 },
      }),
    ).toThrow();
  });
});
