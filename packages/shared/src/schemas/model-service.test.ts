import { describe, expect, it } from 'vitest';

import { ModelAuthScheme, ModelProbeOutcome, ModelServicePlacement } from '../enums';
import {
  MODEL_SERVICE_BAD_URL,
  MODEL_SERVICE_INSECURE_URL,
  modelProbeResultSchema,
  modelServiceSettingsSchema,
  modelServiceUpdateSchema,
  parseModelServiceBaseUrl,
} from './model-service';

describe('parseModelServiceBaseUrl', () => {
  it.each([
    ['https://api.proxyapi.ru/v1', ModelServicePlacement.External],
    ['https://llm.api.cloud.yandex.net/v1', ModelServicePlacement.External],
    ['http://llm.internal:8000/v1', ModelServicePlacement.Local],
  ])('принимает годный адрес %s', (url, placement) => {
    expect(parseModelServiceBaseUrl(url, placement).host).not.toBeNull();
  });

  it('отвергает строку запроса: ровно так ключ попадает в адрес', () => {
    // Инвариант: не «не показываем, потому что там может быть ключ», а
    // «его там быть не может» (дизайн, 3.5).
    expect(() =>
      parseModelServiceBaseUrl(
        'https://api.example/v1?key=sk-secret',
        ModelServicePlacement.External,
      ),
    ).toThrow(MODEL_SERVICE_BAD_URL);
  });

  it('отвергает хвост после решётки', () => {
    expect(() =>
      parseModelServiceBaseUrl('https://api.example/v1#sk-secret', ModelServicePlacement.External),
    ).toThrow(MODEL_SERVICE_BAD_URL);
  });

  it('отвергает данные входа в адресе', () => {
    expect(() =>
      parseModelServiceBaseUrl('https://user:pass@api.example/v1', ModelServicePlacement.External),
    ).toThrow(MODEL_SERVICE_BAD_URL);
  });

  it.each(['ftp://api.example/v1', 'file:///etc/passwd', 'не адрес'])(
    'отвергает негодную схему %s',
    (url) => {
      expect(() => parseModelServiceBaseUrl(url, ModelServicePlacement.External)).toThrow(
        MODEL_SERVICE_BAD_URL,
      );
    },
  );

  it('отвергает http у внешнего узла: ключ ушёл бы по открытому каналу', () => {
    expect(() =>
      parseModelServiceBaseUrl('http://api.example/v1', ModelServicePlacement.External),
    ).toThrow(MODEL_SERVICE_INSECURE_URL);
  });

  it('разрешает http у узла в контуре', () => {
    // Запретить значило бы запретить ровно тот путь, который закрывает
    // утечку целиком (дизайн, 4.2).
    expect(
      parseModelServiceBaseUrl('http://llm.internal:8000', ModelServicePlacement.Local).host,
    ).toBe('llm.internal');
  });

  it('снимает замыкающую косую черту', () => {
    // Иначе в пути окажется двойная: адаптер дописывает `/chat/completions`.
    expect(
      parseModelServiceBaseUrl('https://api.example/v1/', ModelServicePlacement.External).baseUrl,
    ).toBe('https://api.example/v1');
  });

  it('сохраняет порт и путь, а не только имя узла', () => {
    // Адрес — то, что человек скопировал из документации провайдера:
    // собрать его обратно иначе значило бы послать запрос не туда.
    expect(
      parseModelServiceBaseUrl('http://llm.internal:8000/v1', ModelServicePlacement.Local).baseUrl,
    ).toBe('http://llm.internal:8000/v1');
  });
});

describe('modelServiceUpdateSchema', () => {
  const valid = {
    baseUrl: 'https://api.proxyapi.ru/v1',
    authScheme: ModelAuthScheme.Bearer,
    model: 'qwen/qwen3-max',
    folder: null,
    placement: ModelServicePlacement.External,
    timeoutSeconds: 60,
    isEnabled: true,
  };

  it('принимает настройку без поля ключа: «не менять»', () => {
    expect(modelServiceUpdateSchema.parse(valid).secret).toBeUndefined();
  });

  it('принимает null в ключе: «убрать»', () => {
    expect(modelServiceUpdateSchema.parse({ ...valid, secret: null }).secret).toBeNull();
  });

  it('отвергает пустую строку в ключе', () => {
    // Иначе «убрать ключ» и «форма отправила незаполненное поле» были бы
    // одним и тем же, и открыть форму, ничего не трогая, и сохранить
    // значило бы стереть ключ (дизайн, 4.2).
    expect(modelServiceUpdateSchema.safeParse({ ...valid, secret: '' }).success).toBe(false);
  });

  it('отвергает неположительный предел ожидания', () => {
    expect(modelServiceUpdateSchema.safeParse({ ...valid, timeoutSeconds: 0 }).success).toBe(false);
  });

  it('отвергает лишние поля', () => {
    // `preset` — ровно то поле, которое было бы соблазнительно послать с
    // формы: пресеты не хранятся (дизайн, 10.1).
    expect(modelServiceUpdateSchema.safeParse({ ...valid, preset: 'yandex' }).success).toBe(false);
  });

  it('отвергает пустое имя модели: решать на месте нечем', () => {
    expect(modelServiceUpdateSchema.safeParse({ ...valid, model: '  ' }).success).toBe(false);
  });
});

describe('modelServiceSettingsSchema', () => {
  it('ключа в проекции нет ни одним полем', () => {
    // Наружу идёт только «задан»: ни длины, ни хвоста (дизайн, 3.4).
    const keys = Object.keys(modelServiceSettingsSchema.shape);

    expect(keys).toContain('hasSecret');
    expect(keys.filter((key) => /secret/i.test(key))).toEqual(['hasSecret']);
  });

  it('имён переменных окружения в проекции нет: их не показывает никто', () => {
    // Бирка источника отвечает на тот же вопрос, а поле в ответе, которое
    // никто не показывает, со следующей правкой начнут показывать по
    // ошибке (дизайн 2026-11-19, 5.3).
    const keys = Object.keys(modelServiceSettingsSchema.shape);

    expect(keys).toContain('source');
    expect(keys).not.toContain('envVarNames');
    expect(keys).not.toContain('hasEnvironmentSettings');
  });
});

describe('modelProbeResultSchema', () => {
  it('тела чужого ответа в результате нет ни одним полем', () => {
    // В нём бывает и эхо присланного, и сам ключ в сообщении о неверном
    // заголовке (дизайн, 8.3). Число кода — не утечка, тело — утечка.
    expect(Object.keys(modelProbeResultSchema.shape)).toEqual([
      'outcome',
      'status',
      'host',
      'model',
      'durationMs',
    ]);
  });

  it('принимает исход без кода HTTP: сети могло не быть вовсе', () => {
    expect(
      modelProbeResultSchema.parse({
        outcome: ModelProbeOutcome.Unavailable,
        status: null,
        host: 'api.proxyapi.ru',
        model: 'qwen/qwen3-max',
        durationMs: 0,
      }).status,
    ).toBeNull();
  });
});
