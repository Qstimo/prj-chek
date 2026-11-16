import { HealthState } from '@cairn/shared';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { domainStatuses, healthStateEnum } from './status';

describe('статусы окружений', () => {
  it('перечисление совпадает с контрактом', () => {
    expect(healthStateEnum.enumValues).toEqual(Object.values(HealthState));
  });

  it('отдельной таблицы статусов окружения больше нет', async () => {
    // Пока результаты лежали в двух таблицах с разными ключами, они могли
    // описывать разные хосты. Теперь ключ один — адрес.
    const schema = await import('../schema');

    expect('environmentStatuses' in schema).toBe(false);
  });
});

describe('статусы доменов', () => {
  it('статус адреса хранит здоровье рядом со сроками', () => {
    const columns = getTableConfig(domainStatuses).columns.map((column) => column.name);

    expect(columns).toEqual(
      expect.arrayContaining(['health', 'latency_ms', 'health_error', 'tls_valid_to']),
    );
  });

  it('статус адреса хранит результат разрешения', () => {
    const columns = getTableConfig(domainStatuses).columns.map((column) => column.name);

    expect(columns).toEqual(expect.arrayContaining(['resolved_ip', 'resolve_error']));
  });

  it('статус адреса хранит все адреса записи, а не только выбранный', () => {
    // По множеству видно, что имя за CDN смотрит на край сети, а не на
    // машину: по одному адресу этого не сказать.
    const columns = getTableConfig(domainStatuses).columns.map((column) => column.name);

    expect(columns).toEqual(expect.arrayContaining(['resolved_ips']));
  });

  it('статус адреса хранит код причины и цель редиректа', () => {
    // Фраза «не отвечает (fetch failed)» не говорит ничего: с кодом
    // человек идёт разбираться дальше.
    const columns = getTableConfig(domainStatuses).columns.map((column) => column.name);

    expect(columns).toEqual(expect.arrayContaining(['health_code', 'redirect_to']));
  });

  it('статус адреса хранит доверие сертификату рядом с его сроком', () => {
    // Пока в строке лежал один срок, зелёное «TLS до 2027-03-01»
    // уживалось с красным «не отвечает».
    const columns = getTableConfig(domainStatuses).columns.map((column) => column.name);

    expect(columns).toEqual(expect.arrayContaining(['tls_trusted', 'tls_code']));
  });

  it('множество адресов может быть неизвестно', () => {
    // Строка, записанная до появления колонки, множества не знает:
    // пустой список был бы о ней неправдой.
    expect(domainStatuses.resolvedIps.notNull).toBe(false);
  });

  it('здоровье адреса может быть ещё не измерено', () => {
    // Адрес мог появиться минуту назад: молчание честнее выдуманного «жив».
    expect(domainStatuses.health.notNull).toBe(false);
  });

  it('у домена не больше одной строки статуса', () => {
    const unique = getTableConfig(domainStatuses).uniqueConstraints.find(
      (constraint) => constraint.name === 'domain_statuses_domain',
    );

    expect(unique?.columns.map((column) => column.name)).toEqual(['domain_id']);
  });
});
