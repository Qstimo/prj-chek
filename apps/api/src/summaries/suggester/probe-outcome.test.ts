import { ModelProbeOutcome } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { probeOutcomeOf } from './probe-outcome';

describe('probeOutcomeOf', () => {
  it.each([
    [200, ModelProbeOutcome.Ok],
    [201, ModelProbeOutcome.Ok],
    [401, ModelProbeOutcome.Unauthorized],
    [403, ModelProbeOutcome.Unauthorized],
    [404, ModelProbeOutcome.NotFound],
    [400, ModelProbeOutcome.BadRequest],
    [422, ModelProbeOutcome.BadRequest],
    [429, ModelProbeOutcome.Unavailable],
    [500, ModelProbeOutcome.Unavailable],
    [503, ModelProbeOutcome.Unavailable],
  ])('ответ %i даёт исход %s', (status, outcome) => {
    // Шесть исходов, а не «получилось / не получилось»: по ним человек
    // делает разное — берёт новый ключ, правит адрес, правит имя модели
    // или ждёт и нажимает снова (дизайн, 4.3).
    expect(probeOutcomeOf(status)).toBe(outcome);
  });

  it('429 не считается отказом в запросе: ждать, а не править настройку', () => {
    // Он стоит в одном ряду с `5xx` намеренно: правильное действие
    // человека тут «нажать ещё раз», а не «искать ошибку в настройке».
    expect(probeOutcomeOf(429)).toBe(ModelProbeOutcome.Unavailable);
  });

  it('переадресация считается недоступностью', () => {
    // Адаптер её не выполняет (`redirect: 'error'`), так что сюда код
    // `3xx` доходит только от узла, который отвечает не тем, что мы
    // спросили, — ждать его разумнее, чем править настройку.
    expect(probeOutcomeOf(302)).toBe(ModelProbeOutcome.Unavailable);
  });
});
