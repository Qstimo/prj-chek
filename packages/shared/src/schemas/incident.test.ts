import { describe, expect, it } from 'vitest';

import { StatusCheckCode } from '../enums';

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
  const INCIDENT = {
    id: '00000000-0000-0000-0000-000000000001',
    domainId: '00000000-0000-0000-0000-000000000002',
    startedAt: '2026-10-20T10:00:00.000Z',
    resolvedAt: null,
    cause: 'HTTP 500',
    lastCause: 'HTTP 500',
    lastDownAt: '2026-10-20T10:30:00.000Z',
    checks: 3,
    probe: null,
  };

  it('принимает открытый инцидент', () => {
    const parsed = incidentSchema.parse(INCIDENT);

    expect(parsed.resolvedAt).toBeNull();
  });

  it('принимает инцидент без причины', () => {
    // Причина — данные проверки: её может не быть, а инцидент есть.
    expect(() =>
      incidentSchema.parse({
        ...INCIDENT,
        resolvedAt: '2026-10-20T10:40:00.000Z',
        cause: null,
        lastCause: null,
      }),
    ).not.toThrow();
  });

  it('отвергает инцидент без момента начала', () => {
    const { startedAt: _, ...withoutStart } = INCIDENT;

    expect(() => incidentSchema.parse(withoutStart)).toThrow();
  });

  it('помнит последнюю причину отдельно от первой', () => {
    // Причина замораживалась на моменте открытия, и «HTTP 404» стоял в
    // истории шесть суток, хотя адрес давно отвечал другим. Первая
    // причина отвечает «с чего началось», последняя — «чем кончилось».
    const parsed = incidentSchema.parse({
      ...INCIDENT,
      cause: 'HTTP 404',
      lastCause: 'DNS не отвечает (EAI_AGAIN)',
    });

    expect(parsed.cause).toBe('HTTP 404');
    expect(parsed.lastCause).toBe('DNS не отвечает (EAI_AGAIN)');
  });

  it('старый инцидент без подробностей принимается', () => {
    // Строки, заведённые до появления подробностей, остаются в истории:
    // их подтверждением считается открывшая проверка, а последняя
    // причина неизвестна — и это пустота, а не «такой же, как первая».
    const parsed = incidentSchema.parse({
      ...INCIDENT,
      lastCause: null,
      lastDownAt: null,
      checks: 1,
    });

    expect(parsed.lastDownAt).toBeNull();
  });

  it('слепок падения принимается целиком', () => {
    // Снимается один раз и читается целиком: форму держит контракт, а не
    // своя SQL-проверка в базе.
    const parsed = incidentSchema.parse({
      ...INCIDENT,
      probe: {
        at: '2026-10-20T10:00:05.000Z',
        resolvedIps: ['203.0.113.10'],
        resolveError: null,
        ports: [
          { port: 443, code: StatusCheckCode.ConnectionRefused, ms: 4 },
          { port: 80, code: null, ms: 2 },
        ],
      },
    });

    expect(parsed.probe?.ports).toHaveLength(2);
    expect(parsed.probe?.ports[1]?.code).toBeNull();
  });

  it('слепок с незнакомым кодом порта отвергается', () => {
    // Коды — закрытый список контракта: незнакомый означал бы карту
    // расшифровок, которой у веба нет.
    expect(() =>
      incidentSchema.parse({
        ...INCIDENT,
        probe: {
          at: '2026-10-20T10:00:05.000Z',
          resolvedIps: [],
          resolveError: null,
          ports: [{ port: 443, code: 'всё сломалось', ms: 1 }],
        },
      }),
    ).toThrow();
  });

  it('отвергает инцидент без единой подтвердившей проверки', () => {
    // Инцидент заводит проверка: ноль подтверждений означал бы падение,
    // которого никто не видел.
    expect(() => incidentSchema.parse({ ...INCIDENT, checks: 0 })).toThrow();
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
    summary: { falls: 2, downSeconds: 5400, unobservedSeconds: 0, uptime: 0.997917 },
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

  it('время без наблюдения обязательно и неотрицательно', () => {
    // Необязательным его делать нельзя: «поля нет» неотличимо от «нуль
    // секунд», а это разные утверждения — второе говорит, что наблюдение
    // шло всё окно.
    expect(() =>
      addressIncidentHistorySchema.parse({
        ...HISTORY,
        summary: { falls: 2, downSeconds: 5400, uptime: 0.997917 },
      }),
    ).toThrow();
    expect(() =>
      addressIncidentHistorySchema.parse({
        ...HISTORY,
        summary: { ...HISTORY.summary, unobservedSeconds: -1 },
      }),
    ).toThrow();
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
