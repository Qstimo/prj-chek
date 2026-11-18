import { RECORDING_TOO_LARGE, SUMMARY_TEXT_TOO_LONG } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { ApiError } from './errors';
import { summaryFailureOf } from './summary-failure';

/** Отказ сервера с телом, как его строит `readResponse`. */
function apiErrorWith(details: unknown): ApiError {
  return new ApiError(409, 'Действие невозможно в текущем состоянии.', details);
}

describe('разбор отказа потока саммари', () => {
  it('берёт код из тела, а не из фразы', () => {
    expect(summaryFailureOf(apiErrorWith({ code: RECORDING_TOO_LARGE })).code).toBe(
      RECORDING_TOO_LARGE,
    );
  });

  it('предел знаков берётся из отказа', () => {
    expect(summaryFailureOf(apiErrorWith({ code: SUMMARY_TEXT_TOO_LONG, maxChars: 65_536 })).maxChars).toBe(
      65_536,
    );
  });

  it('предел размера из отказа берётся, а не подставляется своим', () => {
    // Настройка узла: подставить своё число значило бы соврать о чужой
    // настройке — то же решение, что у maxChars. Поле одно на оба
    // предела: код отказа уже говорит, о каком пределе речь.
    expect(summaryFailureOf(apiErrorWith({ code: RECORDING_TOO_LARGE, maxBytes: 1 })).maxBytes).toBe(
      1,
    );
  });

  it('не-ApiError ничего не даёт', () => {
    // Подменять сетевой сбой кодом порта значило бы объяснить не то, что
    // случилось.
    expect(summaryFailureOf(new Error('сеть'))).toEqual({});
  });

  it('чужая форма тела не превращается в код', () => {
    expect(summaryFailureOf(apiErrorWith({ code: 7, maxBytes: 'много' }))).toEqual({});
  });
});
