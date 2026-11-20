import express, { json, type RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { JSON_BODY_LIMIT, bodyParsers } from './body-parsers';

/**
 * Самое длинное текстовое поле контракта: содержимое `.env` при импорте
 * (`variable.ts`, 1 Ми знаков). Текст саммари (65 536) и страница
 * документации (200 000) короче и покрываются тем же пределом.
 */
const LONGEST_FIELD_CHARS = 1_048_576;

/** Приложение с заданными разборщиками и ручкой, возвращающей длину. */
function appWith(...handlers: RequestHandler[]): express.Express {
  const app = express();

  handlers.forEach((handler) => app.use(handler));
  app.post('/', (incoming, outgoing) => {
    outgoing.json({ chars: String((incoming.body as { content?: string }).content ?? '').length });
  });

  return app;
}

/** Тело с полем предельной длины. Кириллица — два байта на знак. */
function longestBody(chars = LONGEST_FIELD_CHARS): string {
  return JSON.stringify({ content: 'я'.repeat(chars) });
}

describe('разборщики тела запроса', () => {
  it('принимают самое длинное поле контракта', async () => {
    const response = await request(appWith(...bodyParsers()))
      .post('/')
      .set('Content-Type', 'application/json')
      .send(longestBody());

    expect(response.status).toBe(200);
    expect(response.body.chars).toBe(LONGEST_FIELD_CHARS);
  });

  it('умолчание body-parser то же поле отвергает', async () => {
    // Сторож причины правки: умолчание — 100 КиБ, и через него не
    // проходили ни импорт `.env`, обещанный контрактом, ни саммари
    // длиннее пятидесяти тысяч знаков по-русски. Отказ приходил
    // неназванным `request entity too large` вместо `400` по схеме.
    const response = await request(appWith(json()))
      .post('/')
      .set('Content-Type', 'application/json')
      .send(longestBody());

    expect(response.status).toBe(413);
  });

  it('тело сверх предела отвергается, а не разбирается без конца', async () => {
    // Предел остаётся пределом: вдвое больше самого длинного поля
    // контракта — уже не наш запрос, и разбирать его незачем.
    const response = await request(appWith(...bodyParsers()))
      .post('/')
      .set('Content-Type', 'application/json')
      .send(longestBody(LONGEST_FIELD_CHARS * 3));

    expect(response.status).toBe(413);
  });

  it('предел назван в байтах, а не «на глаз»', () => {
    expect(JSON_BODY_LIMIT).toBe('4mb');
  });
});
