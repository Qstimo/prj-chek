import { describe, expect, it } from 'vitest';

import { transcriptOf } from './transcript';

/** Управляющий символ: запись хроники такой текст не принимает. */
const CONTROL = '\u0007';

/** Событие с нормализованным текстом: в нём пунктуация. */
function refinement(text: string): string {
  return JSON.stringify({ final_refinement: { normalized_text: { alternatives: [{ text }] } } });
}

/** Событие с сырым текстом: без пунктуации, но лучше пустоты. */
function final(text: string): string {
  return JSON.stringify({ final: { alternatives: [{ text }] } });
}

describe('сборка текста расшифровки', () => {
  it('читает поток объектов, разделённых переводами строк', () => {
    const body = [refinement('Обсудили сроки.'), refinement('Решили перенести.')].join('\n');

    expect(transcriptOf(body)).toBe('Обсудили сроки. Решили перенести.');
  });

  it('читает поток объектов, склеенных без разделителя', () => {
    // Свидетельства о провайдере говорят, что так бывает. JSON.parse
    // всего тела здесь падает, а деление по \n не находит границ.
    const body = refinement('Раз.') + refinement('Два.');

    expect(transcriptOf(body)).toBe('Раз. Два.');
  });

  it('предпочитает нормализованный текст сырому', () => {
    const body = [final('раз два'), refinement('Раз, два.')].join('\n');

    expect(transcriptOf(body)).toBe('Раз, два.');
  });

  it('берёт сырой текст, когда нормализованного нет', () => {
    // Текст без пунктуации лучше пустоты: человек его правит.
    expect(transcriptOf(final('раз два'))).toBe('раз два');
  });

  it('пропускает служебные события', () => {
    const body = [
      JSON.stringify({ status_code: { code_type: 'WORKING' } }),
      JSON.stringify({ partial: { alternatives: [{ text: 'раз' }] } }),
      refinement('Раз, два.'),
    ].join('\n');

    // partial — промежуточная догадка, она обновляется и в текст не идёт.
    expect(transcriptOf(body)).toBe('Раз, два.');
  });

  it('обрезанный на середине объект не рушит разбор', () => {
    // Провайдер оборвал ответ: взять надо то, что доехало.
    const body = refinement('Раз.') + '{"final_refinement":{"normalized';

    expect(transcriptOf(body)).toBe('Раз.');
  });

  it('фигурная скобка внутри строки границей не считается', () => {
    // Непарная намеренно: парные скобки внутри строки баланс не сбивают,
    // и тест на `{main}` прошёл бы даже у разбора, который строк не
    // замечает вовсе.
    expect(transcriptOf(refinement('Закрыли скобку } и пошли дальше.'))).toBe(
      'Закрыли скобку } и пошли дальше.',
    );
  });

  it('экранированная кавычка не закрывает строку', () => {
    // Иначе граница объекта нашлась бы не там, и кусок не разобрался бы:
    // баланс скобок считается только вне строковых литералов.
    // За экранированной кавычкой стоит непарная скобка: разбор, который
    // считает кавычку закрывающей, оборвёт объект на ней и потеряет всё
    // событие. Проверяется именно это, а не само написание кавычек.
    expect(transcriptOf(refinement('Сказали "}" и разошлись.'))).toBe(
      'Сказали "}" и разошлись.',
    );
  });

  it('мусор вместо JSON даёт пустоту, а не исключение', () => {
    expect(transcriptOf('<html>502 Bad Gateway</html>')).toBe('');
  });

  it('пустой ответ даёт пустоту', () => {
    // Выше этой функции пустота превращается в transcription_empty:
    // создавать саммари из пустого текста нечем.
    expect(transcriptOf('')).toBe('');
  });

  it('несколько вариантов одного события склеиваются по порядку', () => {
    // Альтернатив у события бывает больше одной; выбирать «лучшую» нам
    // нечем, а терять текст — хуже, чем склеить.
    const body = JSON.stringify({
      final_refinement: { normalized_text: { alternatives: [{ text: 'Раз.' }, { text: 'Два.' }] } },
    });

    expect(transcriptOf(body)).toBe('Раз. Два.');
  });

  it('событие без текста не добавляет пустого промежутка', () => {
    const body = [
      JSON.stringify({ final_refinement: { normalized_text: { alternatives: [] } } }),
      refinement('Раз.'),
    ].join('\n');

    expect(transcriptOf(body)).toBe('Раз.');
  });

  it('нормализует собранный текст той же функцией, что вставленный', () => {
    // Иначе один и тот же созвон имел бы разную длину в зависимости от
    // того, как попал в систему.
    expect(transcriptOf(refinement('раз\r\nдва'))).toBe('раз\nдва');
  });

  it('управляющие символы в ответе службы дают пустоту, а не исключение', () => {
    // Такой текст в запись хроники не ляжет (`normalizeSummaryText`
    // отвергает его), а переспросить человека нечем: текст он не вводил.
    // Честный исход — та же пустота, то есть transcription_empty.
    expect(transcriptOf(refinement(`раз${CONTROL}два`))).toBe('');
  });
});
