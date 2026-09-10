import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { domains } from './domains';
import { environmentDomains } from './environments';

describe('корневые домены', () => {
  it('имя обязательно и уникально', () => {
    expect(domains.name.notNull).toBe(true);

    const unique = getTableConfig(domains).uniqueConstraints.find(
      (constraint) => constraint.name === 'domains_name',
    );

    expect(unique?.columns.map((column) => column.name)).toEqual(['name']);
  });

  it('допускает корень без владельца, регистратора и срока', () => {
    // Корень заводится автоматически при сохранении домена окружения:
    // его свойства заполняет суперадмин позже.
    expect(domains.owner.notNull).toBe(false);
    expect(domains.registrar.notNull).toBe(false);
    expect(domains.paidUntil.notNull).toBe(false);
  });

  it('срок продления хранится календарной датой', () => {
    expect(domains.paidUntil.getSQLType()).toBe('date');
  });
});

describe('привязка поддомена к корню', () => {
  it('поддомен обязан принадлежать корню', () => {
    // Домен без корня некому продлевать — такое состояние бессмысленно.
    expect(environmentDomains.domainId.notNull).toBe(true);
  });

  it('корень не удаляется каскадом вместе с поддоменами', () => {
    const cascading = getTableConfig(environmentDomains)
      .foreignKeys.map((key) => key.onDelete)
      .filter((action) => action !== 'restrict');

    expect(cascading).toEqual([]);
  });

  it('ссылка ведёт на таблицу корней', () => {
    const reference = getTableConfig(environmentDomains)
      .foreignKeys.map((key) => key.reference())
      .find((reference) => reference.foreignTable === domains);

    expect(reference?.foreignColumns.map((column) => column.name)).toEqual(['id']);
  });
});
