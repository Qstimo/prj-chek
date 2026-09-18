import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { environments } from './environments';
import { servers } from './servers';

describe('серверы', () => {
  it('имя обязательно и уникально', () => {
    // Имя — единственное, по которому машину зовут в разговоре:
    // два «hetzner» в списке сделали бы карту бесполезной.
    expect(servers.name.notNull).toBe(true);

    const unique = getTableConfig(servers).uniqueConstraints.find(
      (constraint) => constraint.name === 'servers_name',
    );

    expect(unique?.columns.map((column) => column.name)).toEqual(['name']);
  });

  it('машина ищется по адресу, но уникальности адреса не требует', () => {
    // «IP определяет машину» выглядит инвариантом, но им не является:
    // NAT, переезды и две записи об одной машине — обычная жизнь реестра.
    const config = getTableConfig(servers);

    expect(config.indexes.map((index) => index.config.name)).toContain('servers_ip_idx');
    expect(config.uniqueConstraints.map((unique) => unique.name)).not.toContain('servers_ip');
  });

  it('допускает сервер без параметров, кроме имени', () => {
    expect(servers.owner.notNull).toBe(false);
    expect(servers.host.notNull).toBe(false);
    expect(servers.ip.notNull).toBe(false);
    expect(servers.paidUntil.notNull).toBe(false);
  });

  it('срок оплаты хранится календарной датой', () => {
    // У «оплачен до 12 октября» нет часа, и зона ему не нужна.
    expect(servers.paidUntil.getSQLType()).toBe('date');
  });
});

describe('привязка окружения к серверу', () => {
  it('окружение ссылается на сервер и допускает отсутствие ссылки', () => {
    expect(environments.serverId.notNull).toBe(false);

    const reference = getTableConfig(environments)
      .foreignKeys.map((key) => key.reference())
      .find((reference) => reference.foreignTable === servers);

    expect(reference?.foreignColumns.map((column) => column.name)).toEqual(['id']);
  });

  it('сервер не удаляется каскадом вместе с окружениями', () => {
    // Удаление машины должно быть осознанным переносом, а не каскадом.
    const cascading = getTableConfig(environments)
      .foreignKeys.map((key) => key.onDelete)
      .filter((action) => action !== 'restrict');

    expect(cascading).toEqual([]);
  });

  it('серверные параметры машины из окружения убраны', () => {
    expect(environments).not.toHaveProperty('ip');
    expect(environments).not.toHaveProperty('provider');
    expect(environments).not.toHaveProperty('specs');
  });
});
