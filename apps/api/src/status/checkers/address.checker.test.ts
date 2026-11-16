import { StatusCheckCode } from '@cairn/shared';
import { describe, expect, it, vi } from 'vitest';

import { resolveAddress } from './address.checker';

describe('resolveAddress', () => {
  it('возвращает все адреса записи, а не первый', async () => {
    // Резолверы ротируют порядок ответа: пока бралась первая запись,
    // разрешённый адрес плясал от прогона к прогону, а предупреждение о
    // расхождении мигало вместе с ним.
    const resolveFn = vi.fn().mockResolvedValue(['203.0.113.11', '203.0.113.10']);

    const result = await resolveAddress('prod.example.com', resolveFn);

    expect(result.ips).toEqual(['203.0.113.10', '203.0.113.11']);
    expect(result.error).toBeNull();
    expect(result.code).toBeNull();
    expect(resolveFn).toHaveBeenCalledWith('prod.example.com');
  });

  it('порядок ответа не меняет результата', async () => {
    // Упорядочивание и есть лекарство от мигания: одно и то же множество,
    // пришедшее в разном порядке, обязано давать одну и ту же строку.
    const first = await resolveAddress('a', vi.fn().mockResolvedValue(['198.51.100.2', '198.51.100.1']));
    const second = await resolveAddress('a', vi.fn().mockResolvedValue(['198.51.100.1', '198.51.100.2']));

    expect(first.ips).toEqual(second.ips);
  });

  it('повторы в ответе сводятся к одному адресу', async () => {
    const resolveFn = vi.fn().mockResolvedValue(['203.0.113.10', '203.0.113.10']);

    expect((await resolveAddress('a', resolveFn)).ips).toEqual(['203.0.113.10']);
  });

  it('пустой ответ — не адрес, а причина', async () => {
    const resolveFn = vi.fn().mockResolvedValue([]);

    const result = await resolveAddress('prod.example.com', resolveFn);

    expect(result.ips).toEqual([]);
    expect(result.code).toBe(StatusCheckCode.DnsNoRecord);
    expect(result.error).not.toBeNull();
  });

  it('несуществующее имя — причина с кодом, а не исключение', async () => {
    // Недоступность — данные проверки, а не авария: тем же правилом
    // живут остальные три проверяльщика.
    const resolveFn = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('queryA ENOTFOUND нет.example.com'), { code: 'ENOTFOUND' }),
      );

    const result = await resolveAddress('нет.example.com', resolveFn);

    expect(result.ips).toEqual([]);
    expect(result.code).toBe(StatusCheckCode.DnsNotFound);
    expect(result.error).toContain('ENOTFOUND');
  });

  it('временный отказ DNS отличается от несуществующего имени', async () => {
    // Разница важна: первое означает «спросим снова», второе — «имя
    // снято», и предупреждение о расхождении по ним ведёт себя разно.
    const resolveFn = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('queryA EAI_AGAIN'), { code: 'EAI_AGAIN' }));

    expect((await resolveAddress('prod.example.com', resolveFn)).code).toBe(
      StatusCheckCode.DnsTemporary,
    );
  });

  it('незнакомый отказ не остаётся без текста', async () => {
    const resolveFn = vi.fn().mockRejectedValue('строка вместо ошибки');

    const result = await resolveAddress('prod.example.com', resolveFn);

    expect(result.code).toBe(StatusCheckCode.Unknown);
    expect(result.error).toBe('причина неизвестна');
  });
});
