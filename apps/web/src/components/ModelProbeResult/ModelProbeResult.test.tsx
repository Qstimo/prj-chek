import { ModelProbeOutcome, type ModelProbeResult as Result } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ModelProbeResult } from './ModelProbeResult';

const result: Result = {
  outcome: ModelProbeOutcome.Ok,
  status: 200,
  host: 'api.proxyapi.ru',
  model: 'qwen/qwen3-max',
  durationMs: 1400,
};

describe('ModelProbeResult', () => {
  it.each([
    [ModelProbeOutcome.Ok, /Связь есть/],
    [ModelProbeOutcome.Unauthorized, /Ключ не принят/],
    [ModelProbeOutcome.NotFound, /\/v1/],
    [ModelProbeOutcome.BadRequest, /неверное имя модели/],
    [ModelProbeOutcome.Unavailable, /не ответил/],
    [ModelProbeOutcome.BadResponse, /не тем/],
  ])('по исходу %s говорит, что делать', (outcome, expected) => {
    // Один общий «не вышло» отправил бы человека делать не то
    // (дизайн, 4.3).
    render(<ModelProbeResult result={{ ...result, outcome }} />);

    expect(screen.getByRole('status')).toHaveTextContent(expected);
  });

  it('называет узел, модель и длительность', () => {
    render(<ModelProbeResult result={result} />);

    expect(screen.getByRole('status')).toHaveTextContent(/api\.proxyapi\.ru/);
    expect(screen.getByRole('status')).toHaveTextContent(/qwen\/qwen3-max/);
    expect(screen.getByRole('status')).toHaveTextContent(/1,4 с/);
  });

  it('код чужого ответа показывает числом', () => {
    // Число — не утечка, тело — утечка: в теле бывает и эхо присланного, и
    // сам ключ в сообщении о неверном заголовке (дизайн, 8.3).
    render(
      <ModelProbeResult
        result={{ ...result, outcome: ModelProbeOutcome.Unauthorized, status: 401 }}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/401/);
  });

  it('фразу собирает интерфейс: лишних полей исхода он не показывает', () => {
    // Состав того, что приходит с сервера, закрыт схемой контракта; здесь
    // проверяется, что экран не ждёт от него текста.
    render(<ModelProbeResult result={{ ...result, status: null }} />);

    expect(screen.getByRole('status')).toHaveTextContent(/Связь есть/);
  });
});
