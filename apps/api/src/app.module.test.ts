import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { DATABASE } from './db/db.module';
import type { Database } from './db/db.types';

describe('AppModule', () => {
  it('собирается', async () => {
    // Реальное подключение к базе тут не нужно: тест проверяет только то,
    // что граф модулей и зависимостей складывается без ошибок. Настоящее
    // подключение поднимается в сквозных тестах через тестовую фикстуру.
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DATABASE)
      .useValue({} as Database)
      .compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
