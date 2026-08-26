import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { DbModule } from './db.module';

describe('DbModule', () => {
  const original = process.env.DATABASE_URL;

  afterEach(() => {
    // Присваивание undefined положило бы в переменную строку "undefined",
    // которая truthy и утекла бы в соседние тесты.
    if (original === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = original;
    }
  });

  it('отказывается собираться без строки подключения', async () => {
    delete process.env.DATABASE_URL;

    await expect(
      Test.createTestingModule({ imports: [DbModule] }).compile(),
    ).rejects.toThrow(/DATABASE_URL/);
  });
});
