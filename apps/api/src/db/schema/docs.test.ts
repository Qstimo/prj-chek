import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { docPages } from './docs';

describe('страницы документации', () => {
  it('заголовок уникален в проекте', () => {
    const unique = getTableConfig(docPages).uniqueConstraints.find(
      (constraint) => constraint.name === 'doc_pages_project_title',
    );

    expect(unique?.columns.map((column) => column.name).sort()).toEqual(['project_id', 'title']);
  });

  it('требует заголовок, содержимое и автора', () => {
    expect(docPages.title.notNull).toBe(true);
    expect(docPages.content.notNull).toBe(true);
    expect(docPages.createdBySubjectId.notNull).toBe(true);
  });
});
