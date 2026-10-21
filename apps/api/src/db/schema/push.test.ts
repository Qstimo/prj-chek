import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { pushSubscriptions } from './push';

describe('подписки на пуши', () => {
  it('хранит адрес службы и ключи браузера', () => {
    const columns = getTableConfig(pushSubscriptions).columns.map((column) => column.name);

    expect(columns).toEqual(expect.arrayContaining(['subject_id', 'endpoint', 'p256dh', 'auth']));
  });

  it('адрес службы опознаёт устройство и потому уникален', () => {
    // Браузер пересоздаёт подписку сам: повторная не должна плодить строку.
    expect(pushSubscriptions.endpoint.isUnique).toBe(true);
  });

  it('подписка принадлежит субъекту, а не пользователю', () => {
    // Права живут у субъекта — модель прав для людей и машин единая.
    const columns = getTableConfig(pushSubscriptions).columns.map((column) => column.name);

    expect(columns).not.toContain('user_id');
  });
});
