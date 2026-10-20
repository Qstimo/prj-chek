import { describe, expect, it } from 'vitest';

import { formatVapidKeys, generateVapidKeys } from './vapid';

describe('генерация ключей VAPID', () => {
  it('отдаёт пару непустых ключей', () => {
    const keys = generateVapidKeys();

    expect(keys.publicKey.length).toBeGreaterThan(0);
    expect(keys.privateKey.length).toBeGreaterThan(0);
  });

  it('каждый вызов даёт новую пару', () => {
    expect(generateVapidKeys().privateKey).not.toBe(generateVapidKeys().privateKey);
  });

  it('печатает готовые строки окружения', () => {
    const text = formatVapidKeys({ publicKey: 'откр', privateKey: 'закр' });

    expect(text).toContain('CAIRN_VAPID_PUBLIC_KEY=откр');
    expect(text).toContain('CAIRN_VAPID_PRIVATE_KEY=закр');
  });

  it('напоминает про третью переменную', () => {
    // Без CAIRN_VAPID_SUBJECT транспорт не соберётся, и уведомления
    // молча не заработают.
    expect(formatVapidKeys({ publicKey: 'о', privateKey: 'з' })).toContain('CAIRN_VAPID_SUBJECT');
  });
});
