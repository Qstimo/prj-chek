import { describe, expect, it } from 'vitest';

import { assertPublicScheme, extractTitle, isPrivateAddress } from './link-title.guard';

describe('проверка адреса перед походом наружу', () => {
  it.each([
    ['127.0.0.1', 'петля'],
    ['10.1.2.3', 'частная сеть'],
    ['172.16.0.5', 'частная сеть'],
    ['172.31.255.254', 'частная сеть'],
    ['192.168.1.1', 'частная сеть'],
    ['169.254.169.254', 'метаданные облака'],
    ['0.0.0.0', 'этот хост'],
    ['100.64.0.1', 'операторский NAT'],
    ['224.0.0.1', 'групповая рассылка'],
    ['255.255.255.255', 'широковещательный'],
    ['::1', 'петля IPv6'],
    ['::', 'неопределённый'],
    ['fd00::1', 'уникальный локальный'],
    ['fe80::1', 'link-local'],
    ['fc00::1', 'уникальный локальный, начало диапазона'],
    ['febf::1', 'link-local, конец диапазона'],
    // IPv4 в обёртке IPv6: проверка по первой группе такой адрес пропускала,
    // потому что у строки, начинающейся с `::`, первая группа пуста.
    ['::ffff:127.0.0.1', 'петля в обёртке IPv6'],
    ['::ffff:169.254.169.254', 'метаданные облака в обёртке IPv6'],
    ['::ffff:10.0.0.7', 'частная сеть в обёртке IPv6'],
    ['::ffff:7f00:1', 'петля в обёртке IPv6, шестнадцатеричная запись'],
    ['0:0:0:0:0:ffff:192.168.1.1', 'частная сеть в развёрнутой обёртке'],
    ['::127.0.0.1', 'петля в устаревшей обёртке без ffff'],
    ['64:ff9b::127.0.0.1', 'петля через NAT64'],
  ])('считает %s приватным (%s)', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each([
    '93.184.216.34',
    '8.8.8.8',
    '172.32.0.1',
    '2606:2800:220:1:248:1893:25c8:1946',
    // Обёртка публичного адреса остаётся публичной: внутри неё проверяется
    // тот самый IPv4, по которому запрос и пойдёт.
    '::ffff:93.184.216.34',
    '64:ff9b::8.8.8.8',
  ])('считает %s публичным', (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });

  it.each(['ftp://example.com/', 'file:///etc/passwd', 'gopher://example.com/'])(
    'отвергает схему %s',
    (url) => {
      expect(() => assertPublicScheme(new URL(url))).toThrow();
    },
  );

  it.each(['http://example.com/', 'https://example.com/'])('пропускает схему %s', (url) => {
    expect(() => assertPublicScheme(new URL(url))).not.toThrow();
  });
});

describe('разбор заголовка страницы', () => {
  it('берёт содержимое title', () => {
    expect(extractTitle('<html><head><title>TASK-17: биллинг</title></head></html>')).toBe(
      'TASK-17: биллинг',
    );
  });

  it('раскрывает сущности', () => {
    expect(extractTitle('<title>Счёт &amp; договор</title>')).toBe('Счёт & договор');
  });

  it('переживает перенос строки и лишние пробелы внутри', () => {
    expect(extractTitle('<title>\n  Задача\n  номер\n</title>')).toBe('Задача номер');
  });

  it('понимает title с атрибутами', () => {
    expect(extractTitle('<title lang="ru">Задача</title>')).toBe('Задача');
  });

  it('без title отдаёт null', () => {
    expect(extractTitle('<html><body>нет заголовка</body></html>')).toBeNull();
  });

  it('пустой title отдаёт null', () => {
    expect(extractTitle('<title>   </title>')).toBeNull();
  });

  it('обрезает по пределу формулировки чекпоинта', () => {
    expect(extractTitle(`<title>${'я'.repeat(400)}</title>`)).toHaveLength(300);
  });
});
