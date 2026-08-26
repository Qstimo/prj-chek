import { resolve } from 'node:path';

import { config } from 'dotenv';

/**
 * Загружает переменные окружения из корневого `.env`.
 *
 * Вызывается первой строкой в точках входа: приложении, миграциях и командах
 * консоли. Под тестами файл не читается — значения задаёт `vitest.config.ts`.
 *
 * Не импортируй эту функцию из тестов: она опирается на `__dirname`, которого
 * нет в ESM, а Vitest транспилирует файлы именно в ESM.
 */
export function loadEnv(): void {
  config({ path: resolve(__dirname, '../../../.env') });
}
