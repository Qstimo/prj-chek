import { describe, expect, it } from 'vitest';

import { parseAddress, rootHintOf } from './parse-address';

describe('разбор введённого адреса', () => {
  it('пустой адрес не разбирается', () => {
    expect(parseAddress('', [])).toBeNull();
    expect(parseAddress('   ', [])).toBeNull();
  });

  it('узнаёт корень в самом адресе', () => {
    expect(parseAddress('example.com', [])).toMatchObject({
      name: 'example.com',
      root: 'example.com',
      isRoot: true,
    });
  });

  it('узнаёт поддомен', () => {
    expect(parseAddress('api.example.com', [])).toMatchObject({
      name: 'api.example.com',
      root: 'example.com',
      isRoot: false,
    });
  });

  it('приводит адрес к нижнему регистру, как это сделает сервер', () => {
    expect(parseAddress(' API.Example.COM ', [])).toMatchObject({ name: 'api.example.com' });
  });

  it('понимает адрес, вставленный из адресной строки', () => {
    // Разбор обязан показывать то же имя, которое сохранит сервер: там
    // такая же нормализация, и расходиться им нельзя.
    expect(parseAddress('https://stage.fc.critica.im/', [])).toMatchObject({
      name: 'stage.fc.critica.im',
      root: 'critica.im',
      isRoot: false,
    });
  });

  it('помнит зоны третьего уровня', () => {
    expect(parseAddress('api.shop.co.uk', [])).toMatchObject({ root: 'shop.co.uk' });
  });

  it('отмечает корень, уже заведённый в реестре', () => {
    expect(parseAddress('api.example.com', ['example.com'])?.isKnownRoot).toBe(true);
    expect(parseAddress('api.shop.ru', ['example.com'])?.isKnownRoot).toBe(false);
  });

  it('при зафиксированном корне вводится только левая часть', () => {
    expect(parseAddress('api', [], 'example.com')).toMatchObject({
      name: 'api.example.com',
      root: 'example.com',
      isRoot: false,
    });
  });

  it('зафиксированный корень остаётся корнем, даже в зоне третьего уровня', () => {
    // Карточка корня уже назвала корень: `shop` под `co.uk` — адрес
    // этой карточки, а не новая запись реестра.
    expect(parseAddress('shop', [], 'co.uk')).toMatchObject({
      name: 'shop.co.uk',
      root: 'co.uk',
      isRoot: false,
    });
  });

  it('пустая левая часть при зафиксированном корне — не адрес', () => {
    expect(parseAddress('', [], 'example.com')).toBeNull();
  });
});

describe('подсказка о корне', () => {
  it('говорит, что корень уже в реестре', () => {
    expect(rootHintOf(parseAddress('api.example.com', ['example.com'])!)).toBe(
      'Корень: example.com — уже в реестре',
    );
  });

  it('предупреждает, что корень будет заведён', () => {
    expect(rootHintOf(parseAddress('api.example.com', [])!)).toBe(
      'Корень: example.com — будет заведён',
    );
  });

  it('без видимого реестра судьбу корня не выдумывает', () => {
    expect(rootHintOf(parseAddress('api.example.com', [])!, false)).toBe('Корень: example.com');
  });
});
