import 'reflect-metadata';

import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { bodyParsers, intakeTextParser } from './common/body-parsers';
import { PostgresExceptionFilter } from './common/postgres-exception.filter';
import { loadEnv } from './env';

/** Точка входа. CORS не настраивается: оба приложения за одним реверс-прокси. */
async function bootstrap(): Promise<void> {
  loadEnv();

  // Разборщики ставятся свои, а не умолчанием Nest: умолчание body-parser
  // — 100 КиБ, то есть **ниже контракта**, и длинное тело получало
  // неназванное `request entity too large` вместо `400` по схеме
  // (`common/body-parsers.ts`).
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  bodyParsers().forEach((parser) => app.use(parser));
  app.use(cookieParser());
  // Приёмный канал принимает сводку и чистым текстом (спека 5.1); предел
  // считается от его поля контракта, а не равен числу знаков.
  app.use(intakeTextParser());
  app.setGlobalPrefix('api');
  // Сырое нарушение ограничения базы не должно выглядеть падением сервера.
  app.useGlobalFilters(new PostgresExceptionFilter(app.get(HttpAdapterHost).httpAdapter));

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();
