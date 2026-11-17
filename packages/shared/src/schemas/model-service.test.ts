import { describe, expect, it } from 'vitest';

import { ModelServicePlacement } from '../enums';
import {
  MODEL_SERVICE_BAD_URL,
  MODEL_SERVICE_INSECURE_URL,
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
