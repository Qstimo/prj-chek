import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { writeSync } from 'node:fs';

import { loadEnv } from '../env';
import { CliModule } from './cli.module';
import { CliCommands } from './commands';

/**
 * Точка входа команд консоли.
 *
 * Поднимается контекст приложения без HTTP-сервера: команды пользуются
 * теми же сервисами, что и API, и потому пишут в журнал одинаково.
 *
 * Завершается явным `process.exit`: подключение к базе живёт в пуле
 * `postgres`, который не закрывается при `context.close()`, и открытый
 * сокет держал бы процесс висящим после того, как команда уже выполнена.
 * Вывод пишется синхронно через `fs.writeSync`, а не `process.stdout.write`,
 * чтобы `process.exit` не оборвал ещё не сброшенный буфер вывода, когда
 * поток стоит на конвейере, а не на терминале.
 */
async function main(): Promise<void> {
  loadEnv();

  const [command, email] = process.argv.slice(2);

  if (!command || !email) {
    writeSync(2, USAGE);
    process.exit(1);
  }

  const context = await NestFactory.createApplicationContext(CliModule, { logger: ['error'] });
  const commands = context.get(CliCommands);
  const webUrl = process.env.CAIRN_WEB_URL ?? 'http://localhost:3000';
  let exitCode = 0;

  try {
    switch (command) {
      case 'create-superadmin': {
        const link = await commands.createSuperadmin(email);
        writeSync(1, formatLink(webUrl, link.token, 'Суперадмин создан'));
        break;
      }

      case 'reset-password': {
        const link = await commands.resetPassword(email);
        writeSync(1, formatLink(webUrl, link.token, 'Пароль сброшен'));
        break;
      }

      case 'reset-totp': {
        await commands.resetTotp(email);
        writeSync(1, 'Второй фактор отвязан. Пользователь сможет привязать его заново.\n');
        break;
      }

      default:
        writeSync(2, USAGE);
        exitCode = 1;
    }
  } catch (error) {
    writeSync(2, `${error instanceof Error ? error.message : String(error)}\n`);
    exitCode = 1;
  } finally {
    await context.close();
  }

  process.exit(exitCode);
}

/** Печатает ссылку, по которой человек задаст пароль. */
function formatLink(webUrl: string, token: string, title: string): string {
  return `${title}.\nСсылка на установку пароля (передайте её лично):\n${webUrl}/invite/${token}\n`;
}

const USAGE = `Использование:
  pnpm --filter @cairn/api cli create-superadmin <email>
  pnpm --filter @cairn/api cli reset-password <email>
  pnpm --filter @cairn/api cli reset-totp <email>
`;

void main();
