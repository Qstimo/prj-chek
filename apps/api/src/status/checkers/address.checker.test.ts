import { describe, expect, it, vi } from 'vitest';

import { resolveAddress } from './address.checker';

describe('resolveAddress', () => {
  it('возвращает первый адрес записи', async () => {
    // Раунд-робин здесь не поддерживается: берём первый и говорим
    // об этом в подсказке интерфейса.
    const resolveFn = vi.fn().mockResolvedValue(['203.0.113.10', '203.0.113.11']);

    const result = await resolveAddress('prod.example.com', resolveFn);

    expect(result).toEqual({ ip: '203.0.113.10', error: null });
    expect(resolveFn).toHaveBeenCalledWith('prod.example.com');
  });

  it('пустой ответ — не адрес, а причина', async () => {
    const resolveFn = vi.fn().mockResolvedValue([]);

    expect(await resolveAddress('prod.example.com', resolveFn)).toEqual({
      ip: null,
      error: 'запись не найдена',
    });
  });

  it('несуществующее имя — причина, а не исключение', async () => {
    // Недоступность — данные проверки, а не авария: тем же правилом
    // живут остальные три проверщика.
    const resolveFn = vi.fn().mockRejectedValue(new Error('queryA ENOTFOUND нет.example.com'));

    const result = await resolveAddress('нет.example.com', resolveFn);

    expect(result.ip).toBeNull();
    expect(result.error).toContain('ENOTFOUND');
  });

  it('незнакомый отказ не остаётся без текста', async () => {
    const resolveFn = vi.fn().mockRejectedValue('строка вместо ошибки');

    expect((await resolveAddress('prod.example.com', resolveFn)).error).toBe('неизвестная ошибка');
  });
});
