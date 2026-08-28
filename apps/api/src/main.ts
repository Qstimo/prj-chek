import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { text } from 'express';

import { AppModule } from './app.module';
import { loadEnv } from './env';

/** Точка входа. CORS не настраивается: оба приложения за одним реверс-прокси. */
async function bootstrap(): Promise<void> {
  loadEnv();

  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  // Приёмный канал принимает сводку и чистым текстом (спека 5.1).
  app.use(text({ type: 'text/plain', limit: '64kb' }));
  app.setGlobalPrefix('api');

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();
