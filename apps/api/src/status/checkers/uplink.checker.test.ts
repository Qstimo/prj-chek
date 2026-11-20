import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_CONTROL_URLS, checkUplink, controlUrlsOf } from './uplink.checker';

describe('controlUrlsOf', () => {
  it('без настройки берёт два хоста по умолчанию', () => {
    expect(controlUrlsOf(undefined)).toEqual(DEFAULT_CONTROL_URLS);
  });

  it('пустое значение выключает проверку целиком', () => {
    // Выключатель нужен закрытому контуру: там наружу не ходит никто, и
    // «сеть потеряна» было бы вечным вердиктом.
    expect(controlUrlsOf('')).toEqual([]);
    expect(controlUrlsOf('   ')).toEqual([]);
  });

  it('читает список через запятую, не оставляя пустых', () => {
    expect(controlUrlsOf('https://a.local/ping, https://b.local/ping ,')).toEqual([
      'https://a.local/ping',
      'https://b.local/ping',
    ]);
  });
});

describe('checkUplink', () => {
  it('ответ хотя бы одного хоста означает, что сеть у нас есть', async () => {
    // Любой из списка, а не все: один контрольный хост может быть
    // заблокирован у провайдера, и это не повод объявлять себя слепым.
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce({ status: 200 });

    const result = await checkUplink(['https://a.local', 'https://b.local'], fetchFn);

    expect(result).toMatchObject({ urls: 2, alive: 1, isLost: false });
  });

  it('первый ответивший останавливает опрос', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ status: 204 });

    await checkUplink(['https://a.local', 'https://b.local'], fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('молчание всех означает потерянную сеть', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    const result = await checkUplink(['https://a.local', 'https://b.local'], fetchFn);

    expect(result).toMatchObject({ urls: 2, alive: 0, isLost: true });
  });

  it('ошибка хоста — не ответ: 500 не доказывает путь', async () => {
    // Контрольный хост спрашивают не о его здоровье, а о том, доходит ли
    // до него запрос; но `5xx` отдаёт и прокси-перехватчик, поэтому
    // ответом считается только успех.
    const fetchFn = vi.fn().mockResolvedValue({ status: 503 });

    const result = await checkUplink(['https://a.local'], fetchFn);

    expect(result).toMatchObject({ alive: 0, isLost: true });
  });

  it('пустой список не спрашивает никого и сети не теряет', async () => {
    const fetchFn = vi.fn();

    const result = await checkUplink([], fetchFn);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result).toMatchObject({ urls: 0, alive: 0, isLost: false });
  });
});
