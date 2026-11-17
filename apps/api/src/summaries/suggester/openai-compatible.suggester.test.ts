import { SUGGESTER_DISABLED, SUGGESTER_UNAVAILABLE, ModelServicePlacement } from '@cairn/shared';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

import { DisabledSuggester } from './disabled.suggester';
import { OpenAiCompatibleSuggester, SYSTEM_PROMPT, TEXT_END, TEXT_START } from './openai-compatible.suggester';
import type { SuggesterSettings } from './settings';

/** Настройки боевого вида: точечные проверки меняют в них одно поле. */
const SETTINGS: SuggesterSettings = {
  placement: ModelServicePlacement.External,
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'ключ',
  model: 'gpt-4o-mini',
  timeoutSeconds: 60,
  maxChars: 40_000,
  maxTasks: 50,
  host: 'api.openai.com',
  isEnabled: true,
};

/** Адаптер на подменённых настройках. */
function suggester(overrides: Partial<SuggesterSettings> = {}): OpenAiCompatibleSuggester {
  return new OpenAiCompatibleSuggester({ ...SETTINGS, ...overrides });
}

/** Подменённый `fetch`, отвечающий телом OpenAI-совместимого ответа. */
function okWith(content: string): Mock {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }),
    );
  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

/** Подменённый `fetch`, который отвечает только на обрыв сигнала. */
function neverAnswering(): Mock {
  const fetchMock = vi.fn((_url: string, init: RequestInit) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () =>
        reject(new DOMException('прервано', 'AbortError')),
      );
    }),
  );
  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

/** Как подменённый `fetch` увидел запрос. */
function initOf(fetchMock: Mock): RequestInit {
  return (fetchMock.mock.calls[0]?.[1] ?? {}) as RequestInit;
}

/** Разобранное тело запроса. */
function bodyOf(fetchMock: Mock): unknown {
  return JSON.parse(String(initOf(fetchMock).body));
}

/** Сигнал на одну секунду: вызывающий строит его сам. */
function signal(): AbortSignal {
  return AbortSignal.timeout(1000);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('адаптер OpenAI-совместимого API', () => {
  it('наружу уходит ровно текст саммари и системная инструкция', async () => {
    // Сравнение тела целиком, а не по полям: иначе новое поле уехало бы
    // наружу незамеченным.
    const fetchMock = okWith('{"tasks":["раз"]}');

    await suggester().suggest('обсудили сроки', signal());

    expect(bodyOf(fetchMock)).toEqual({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `${TEXT_START}\nобсудили сроки\n${TEXT_END}` },
      ],
    });
  });

  it('переадресацию не выполняет, а считает отказом', async () => {
    // Дизайн §5.6: адрес узла задаёт только настройка. Умолчание `fetch` —
    // `follow`, а 307 и 308 сохраняют метод и тело, поэтому настроенный
    // узел мог бы одним ответом переслать текст саммари на любой чужой
    // адрес — и при `local` вынести его за контур, пока и экран, и журнал
    // показывают прежний узел.
    //
    // Проверяется переданная настройка, а не поведение: следование
    // переадресации выполняет платформа, и подменённый `fetch` о ней
    // ничего не знает. Запрет живёт ровно в этой строке запроса.
    const fetchMock = okWith('{"tasks":["раз"]}');

    await suggester().suggest('обсудили сроки', signal());

    expect(initOf(fetchMock).redirect).toBe('error');
  });

  it('спрашивает ручку завершений по настроенному адресу', async () => {
    const fetchMock = okWith('{"tasks":["раз"]}');

    await suggester({ baseUrl: 'http://llm.internal/v1/' }).suggest('текст', signal());

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://llm.internal/v1/chat/completions');
  });

  it('ключ уходит заголовком, когда задан', async () => {
    const fetchMock = okWith('{"tasks":["раз"]}');

    await suggester({ apiKey: 'секрет' }).suggest('текст', signal());

    expect(initOf(fetchMock).headers).toMatchObject({ Authorization: 'Bearer секрет' });
  });

  it('без ключа заголовка нет: локальный endpoint его не требует', async () => {
    const fetchMock = okWith('{"tasks":["раз"]}');

    await suggester({ apiKey: '' }).suggest('текст', signal());

    expect(initOf(fetchMock).headers).not.toHaveProperty('Authorization');
  });

  it('отдаёт формулировки и число отброшенного', async () => {
    okWith('{"tasks":["раз","раз","два"]}');

    expect(await suggester({ maxTasks: 1 }).suggest('текст', signal())).toEqual({
      tasks: [{ title: 'раз' }],
      dropped: 2,
    });
  });

  it.each([429, 500, 503])('%i даёт отказ «не ответил»', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));

    await expect(suggester().suggest('текст', signal())).rejects.toMatchObject({
      code: SUGGESTER_UNAVAILABLE,
    });
  });

  it('обрыв по таймауту даёт тот же отказ', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('', 'AbortError')));

    await expect(suggester().suggest('текст', signal())).rejects.toMatchObject({
      code: SUGGESTER_UNAVAILABLE,
    });
  });

  it('предел ожидания из настройки режет запрос сам', async () => {
    // Повторов порт не делает, и ждать чужой узел дольше настроенного
    // нельзя: один вызов — одна плата, а повтор — нажатие человека.
    neverAnswering();

    await expect(
      suggester({ timeoutSeconds: 0.001 }).suggest('текст', signal()),
    ).rejects.toMatchObject({ code: SUGGESTER_UNAVAILABLE });
  });

  it('ключ не встречается ни в сообщении отказа, ни в его причине', async () => {
    // Секреты не в логах: `cause` чужого ответа наружу не разворачивается.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ключ секрет отвергнут')));

    const error = await suggester({ apiKey: 'секрет' })
      .suggest('текст', signal())
      .catch((cause: unknown) => cause);

    expect(JSON.stringify(error)).not.toContain('секрет');
    expect(String(error)).not.toContain('секрет');
    expect(JSON.stringify(error)).not.toContain('отвергнут');
  });

  it('пустой разбор даёт отказ, а не пустой черновик', async () => {
    okWith('я не умею в json');

    await expect(suggester().suggest('текст', signal())).rejects.toMatchObject({
      code: SUGGESTER_UNAVAILABLE,
    });
  });

  it('честный пустой список — успех с нулём задач, а не отказ узла', async () => {
    // Системная инструкция прямо просит вернуть {"tasks":[]}, если задач
    // в тексте нет. Отказ на этом месте брал бы за тот же текст второй
    // раз и писал в журнал неудачу узла, которой не было.
    okWith('{"tasks":[]}');

    expect(await suggester().suggest('текст', signal())).toEqual({ tasks: [], dropped: 0 });
  });

  it('вывод, из которого ничего не выжило, остаётся отказом', async () => {
    // Дизайн 5.4 говорит именно об этом случае: разобрали, а взять
    // нечего. От «задач нет» он отличается числом отброшенного.
    okWith('{"tasks":["","   "]}');

    await expect(suggester().suggest('текст', signal())).rejects.toMatchObject({
      code: SUGGESTER_UNAVAILABLE,
    });
  });

  it('ответ без завершений — тот же отказ', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"choices":[]}')));

    await expect(suggester().suggest('текст', signal())).rejects.toMatchObject({
      code: SUGGESTER_UNAVAILABLE,
    });
  });

  it('простыня вместо ответа не разбирается', async () => {
    // Предел читаемого тела: разбор чужого мегабайта — это наша память,
    // а не их щедрость.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(`{"choices":[{"message":{"content":"${'я'.repeat(2_000_000)}"}}]}`)),
    );

    await expect(suggester().suggest('текст', signal())).rejects.toMatchObject({
      code: SUGGESTER_UNAVAILABLE,
    });
  });

  it('показывает человеку узел и модель, но не ключ', async () => {
    const shown = suggester({ apiKey: 'секрет' });

    expect(shown).toMatchObject({
      placement: ModelServicePlacement.External,
      host: 'api.openai.com',
      model: 'gpt-4o-mini',
      maxChars: 40_000,
      isEnabled: true,
    });
    expect(JSON.stringify(shown)).not.toContain('секрет');
  });
});

describe('выключенный предложитель', () => {
  it('говорит, что не настроен, и в сеть не ходит', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new DisabledSuggester().suggest('текст', AbortSignal.timeout(1)),
    ).rejects.toMatchObject({ code: SUGGESTER_DISABLED });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('о себе говорит, что выключен, и узла не называет', async () => {
    // Кнопка выключается по `isEnabled`, а подпись под ней — по `host`:
    // называть узел, куда ничего не уходит, значило бы врать.
    expect(new DisabledSuggester()).toMatchObject({ isEnabled: false, host: null });
  });
});
