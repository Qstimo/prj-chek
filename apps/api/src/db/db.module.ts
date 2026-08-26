import { Global, Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import type { Database } from './db.types';
import * as schema from './schema';

/** Токен внедрения подключения к базе. */
export const DATABASE = Symbol('DATABASE');

/**
 * Подключение к базе ролью приложения — без прав на изменение схемы
 * и журнала (спека 4.7). Миграции выполняются другой ролью.
 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: (): Database => {
        const url = process.env.DATABASE_URL;

        if (!url) {
          throw new Error('DATABASE_URL не задан. Проверь .env в корне монорепо.');
        }

        return drizzle(postgres(url), { schema });
      },
    },
  ],
  exports: [DATABASE],
})
export class DbModule {}
