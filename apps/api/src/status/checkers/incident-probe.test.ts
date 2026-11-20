import { StatusCheckCode } from '@cairn/shared';
import { describe, expect, it, vi } from 'vitest';

import { PROBE_PORTS, probeAddress } from './incident-probe';

/** Разрешение имени, отвечающее заданным. */
function resolver(ips: string[], error: string | null = null) {
  return vi.fn().mockResolvedValue({
    ips,
    code: error === null ? null : StatusCheckCode.DnsNotFound,
    error,
  });
}

/** Проба порта, отвечающая заданным кодом. */
function porter(code: StatusCheckCode | null = null) {
  return vi
    .fn()
    .mockImplementation(async (_host: string, port: number) => ({ port, code, ms: 7 }));
}

describe('probeAddress', () => {
  it('разрешает имя заново и стучится в порты найденной машины', async () => {
    // Заново, а не из строки статуса: строка перезаписывается каждым
    // прогоном, и к разбору падения месячной давности в ней стоит
    // нынешний адрес, а не тот, что был тогда.
    const resolveAddress = resolver(['203.0.113.10', '203.0.113.9']);
    const checkPort = porter(StatusCheckCode.ConnectionRefused);

    const probe = await probeAddress('example.com', new Date('2026-11-19T12:00:00Z'), {
      resolveAddress,
      checkPort,
    });

    expect(resolveAddress).toHaveBeenCalledWith('example.com');
    expect(probe.resolvedIps).toEqual(['203.0.113.10', '203.0.113.9']);
    expect(probe.at).toBe('2026-11-19T12:00:00.000Z');
    // Стучимся в тот же адрес, который считается машиной имени, и тем же
    // правилом (`canonicalIpOf`): первый по возрастанию строк — выбор
    // устойчивый, а не самый маленький по величине.
    expect(checkPort).toHaveBeenCalledWith('203.0.113.10', PROBE_PORTS[0]);
    expect(probe.ports.map((port) => port.port)).toEqual([...PROBE_PORTS]);
  });

  it('нерешённое имя порты не проверяет вовсе', async () => {
    // Стучаться некуда, и пустой список портов честнее выдуманных
    // таймаутов: об этом говорит причина разрешения.
    const checkPort = porter();

    const probe = await probeAddress('example.com', new Date(), {
      resolveAddress: resolver([], 'имени нет в DNS (ENOTFOUND)'),
      checkPort,
    });

    expect(checkPort).not.toHaveBeenCalled();
    expect(probe.ports).toEqual([]);
    expect(probe.resolveError).toBe('имени нет в DNS (ENOTFOUND)');
  });

  it('открытый порт остаётся без кода', async () => {
    const probe = await probeAddress('example.com', new Date(), {
      resolveAddress: resolver(['203.0.113.10']),
      checkPort: porter(null),
    });

    expect(probe.ports.every((port) => port.code === null)).toBe(true);
  });

  it('отказ пробы не роняет слепок', async () => {
    // Слепок снимается в момент падения, и уронить им прогон нельзя:
    // неизвестный порт честнее потерянного инцидента.
    const probe = await probeAddress('example.com', new Date(), {
      resolveAddress: resolver(['203.0.113.10']),
      checkPort: vi.fn().mockRejectedValue(new Error('сокет взорвался')),
    });

    expect(probe.ports).toEqual([]);
    expect(probe.resolvedIps).toEqual(['203.0.113.10']);
  });

  it('отказ разрешения имени не роняет слепок', async () => {
    const probe = await probeAddress('example.com', new Date(), {
      resolveAddress: vi.fn().mockRejectedValue(new Error('резолвер взорвался')),
      checkPort: porter(),
    });

    expect(probe.resolvedIps).toEqual([]);
    expect(probe.ports).toEqual([]);
  });
});
