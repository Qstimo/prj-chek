import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { HealthModule } from '../src/health/health.module';

describe('проверка живости по HTTP', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [HealthModule] }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('отвечает без аутентификации: адрес опрашивает Docker, cookie у него нет', async () => {
    const response = await request(app.getHttpServer()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('не обращается к базе: недоступная база не должна гасить контейнер приложения', async () => {
    // Модуль собран без DbModule — сам факт компиляции выше это и доказывает.
    // Проверка повторного запроса ловит попытку завести соединение лениво.
    await request(app.getHttpServer()).get('/api/health').expect(200);
    await request(app.getHttpServer()).get('/api/health').expect(200);
  });
});
