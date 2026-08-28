import { ChronicleSource } from '@cairn/shared';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { chronicleEntries, chronicleSourceEnum } from './chronicle';

describe('записи хроники', () => {
  it('перечисление источника совпадает с контрактом', () => {
    expect(chronicleSourceEnum.enumValues).toEqual(Object.values(ChronicleSource));
  });

  it('требует дату, заголовок, содержимое и автора', () => {
    expect(chronicleEntries.occurredOn.notNull).toBe(true);
    expect(chronicleEntries.title.notNull).toBe(true);
    expect(chronicleEntries.content.notNull).toBe(true);
    expect(chronicleEntries.createdBySubjectId.notNull).toBe(true);
  });

  it('лента читается по проекту и дате', () => {
    const index = getTableConfig(chronicleEntries).indexes.find(
      (candidate) => candidate.config.name === 'chronicle_entries_project_date_idx',
    );

    expect(index).toBeDefined();
  });
});
