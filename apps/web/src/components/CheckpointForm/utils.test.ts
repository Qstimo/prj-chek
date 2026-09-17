import { describe, expect, it, vi } from 'vitest';

import { readLinkTitle } from './utils';

describe('readLinkTitle', () => {
  const onReadTitle = vi.fn(async () => 'Перевести биллинг');

  it('читает заголовок для пустой формулировки', async () => {
    await expect(
      readLinkTitle({ url: ' https://tracker.example.com/TASK-17 ', title: '', onReadTitle }),
    ).resolves.toBe('Перевести биллинг');

    expect(onReadTitle).toHaveBeenCalledWith('https://tracker.example.com/TASK-17');
  });

  it('молчит, когда формулировка уже написана', async () => {
    const reader = vi.fn(async () => 'Из трекера');

    await expect(
      readLinkTitle({ url: 'https://tracker.example.com/TASK-17', title: 'Своя', onReadTitle: reader }),
    ).resolves.toBeNull();

    expect(reader).not.toHaveBeenCalled();
  });

  it('молчит без ссылки', async () => {
    const reader = vi.fn(async () => 'Из трекера');

    await expect(readLinkTitle({ url: '   ', title: '', onReadTitle: reader })).resolves.toBeNull();

    expect(reader).not.toHaveBeenCalled();
  });

  it('молчит, когда читать некому', async () => {
    await expect(
      readLinkTitle({ url: 'https://tracker.example.com/TASK-17', title: '' }),
    ).resolves.toBeNull();
  });

  it('сорвавшееся чтение отдаёт как отсутствие заголовка', async () => {
    await expect(
      readLinkTitle({
        url: 'https://tracker.example.com/TASK-17',
        title: '',
        onReadTitle: async () => Promise.reject(new Error('сеть')),
      }),
    ).resolves.toBeNull();
  });
});
