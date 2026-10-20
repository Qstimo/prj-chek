import { describe, expect, it } from 'vitest';

import { DEFAULT_RECHECK_DELAY_SECONDS, recheckDelayMsOf } from './recheck-delay';

describe('пауза перед переспросом', () => {
  it('по умолчанию — полминуты', () => {
    expect(recheckDelayMsOf(undefined, false)).toBe(DEFAULT_RECHECK_DELAY_SECONDS * 1000);
  });

  it('заданное число секунд переводится в миллисекунды', () => {
    expect(recheckDelayMsOf('5', false)).toBe(5000);
  });

  it('ноль означает переспрос сразу', () => {
    expect(recheckDelayMsOf('0', false)).toBe(0);
  });

  it('мусор и отрицательное значение — тоже сразу', () => {
    expect(recheckDelayMsOf('пять', false)).toBe(0);
    expect(recheckDelayMsOf('-10', false)).toBe(0);
  });

  it('ручной запуск не ждёт вовсе', () => {
    // Человек смотрит на кнопку «Проверить сейчас»: держать запрос
    // полминуты нельзя. Переспрос при этом делается — сразу.
    expect(recheckDelayMsOf(undefined, true)).toBe(0);
    expect(recheckDelayMsOf('30', true)).toBe(0);
  });
});
