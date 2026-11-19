import { StatusCheckCode, type IncidentProbe } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { probePlacementTextOf, probePortsTextOf, probeVerdictTextOf } from './probe';

/** Слепок с заданными портами: имя разрешилось в один адрес. */
function probe(
  ports: { port: number; code: StatusCheckCode | null; ms?: number }[],
  overrides: Partial<IncidentProbe> = {},
): IncidentProbe {
  return {
    at: '2026-11-19T12:00:00.000Z',
    resolvedIps: ['203.0.113.10'],
    resolveError: null,
    ports: ports.map((port) => ({ ms: 3, ...port })),
    ...overrides,
  };
}

describe('probePlacementTextOf', () => {
  it('называет адреса, в которые смотрело имя', () => {
    expect(probePlacementTextOf(probe([]))).toBe('имя смотрело на 203.0.113.10');
  });

  it('несколько адресов перечисляются', () => {
    const many = probe([], { resolvedIps: ['203.0.113.10', '203.0.113.11'] });

    expect(probePlacementTextOf(many)).toBe('имя смотрело на 203.0.113.10, 203.0.113.11');
  });

  it('неразрешённое имя называет причину, а не пустоту', () => {
    const broken = probe([], { resolvedIps: [], resolveError: 'имени нет в DNS (ENOTFOUND)' });

    expect(probePlacementTextOf(broken)).toBe('имя не разрешилось: имени нет в DNS (ENOTFOUND)');
  });

  it('без адресов и без причины говорит ровно это', () => {
    const silent = probe([], { resolvedIps: [], resolveError: null });

    expect(probePlacementTextOf(silent)).toBe('имя не разрешилось');
  });
});

describe('probePortsTextOf', () => {
  it('открытый порт назван открытым, закрытый — своей фразой', () => {
    const text = probePortsTextOf(
      probe([
        { port: 443, code: StatusCheckCode.ConnectionRefused, ms: 4 },
        { port: 80, code: null, ms: 2 },
      ]),
    );

    expect(text).toBe('443 — порт закрыт (4 мс), 80 — принял соединение (2 мс)');
  });

  it('без портов не говорит ничего: стучаться было некуда', () => {
    expect(probePortsTextOf(probe([]))).toBeNull();
  });
});

describe('probeVerdictTextOf', () => {
  it('отказ означает живую машину и молчащую службу', () => {
    // Самая однозначная улика: обратный пакет дошёл, значит путь цел.
    const verdict = probeVerdictTextOf(
      probe([
        { port: 443, code: StatusCheckCode.ConnectionRefused },
        { port: 80, code: StatusCheckCode.ConnectionRefused },
      ]),
    );

    expect(verdict).toMatch(/машина отвечает/i);
    expect(verdict).toMatch(/служба/);
  });

  it('мёртвый 443 при живом 80 читается как фильтр по порту', () => {
    const verdict = probeVerdictTextOf(
      probe([
        { port: 443, code: StatusCheckCode.Timeout },
        { port: 80, code: null },
      ]),
    );

    expect(verdict).toMatch(/фильтр/);
  });

  it('тишина на всех портах — путь до машины', () => {
    const verdict = probeVerdictTextOf(
      probe([
        { port: 443, code: StatusCheckCode.Timeout },
        { port: 80, code: StatusCheckCode.Timeout },
      ]),
    );

    expect(verdict).toMatch(/путь/);
  });

  it('все порты приняли соединение — беда выше уровня сети', () => {
    // Машина пускает, а HTTP не ответил: это к службе или к краю, а не
    // к провайдеру.
    const verdict = probeVerdictTextOf(
      probe([
        { port: 443, code: null },
        { port: 80, code: null },
      ]),
    );

    expect(verdict).toMatch(/принимает соединения/);
  });

  it('неразрешённое имя объясняется само и портами не судится', () => {
    const verdict = probeVerdictTextOf(
      probe([], { resolvedIps: [], resolveError: 'имени нет в DNS (ENOTFOUND)' }),
    );

    expect(verdict).toMatch(/DNS|имя/);
  });

  it('без портов и с разрешённым именем вердикта нет', () => {
    // Выдумывать вывод не из чего: пусто честнее догадки.
    expect(probeVerdictTextOf(probe([]))).toBeNull();
  });
});
