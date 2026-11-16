import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { projectTags, tags } from './tags';

describe('реестр тегов', () => {
  it('форма сопоставления уникальна', () => {
    // Без этого «Web» и «web» легли бы двумя строками реестра, и фильтр
    // по каждой показывал бы часть проектов.
    expect(tags.slug.isUnique).toBe(true);
  });

  it('требует форму сопоставления и показываемое название', () => {
    // Два поля, а не одно: по первому теги сходятся, второе человек
    // видит — приводить его к нижнему регистру значило бы показывать «web».
    expect(tags.slug.notNull).toBe(true);
    expect(tags.label.notNull).toBe(true);
  });

  it('показываемое название не уникально', () => {
    // Уникальность лежит на `slug`: «Web» и «web» — один тег, и второй
    // ключ отверг бы переименование, которое меняет только регистр.
    expect(tags.label.isUnique).toBe(false);
  });
});

describe('теги проекта', () => {
  it('пара «проект × тег» одна', () => {
    const key = getTableConfig(projectTags).primaryKeys[0];

    expect(key?.columns.map((column) => column.name).sort()).toEqual(['project_id', 'tag_id']);
  });

  it('связи проиндексированы по тегу', () => {
    // Горячий путь уборки реестра: остался ли тег хоть у кого-то после
    // снятия. Левый префикс составного ключа на это не отвечает.
    expect(
      getTableConfig(projectTags).indexes.map((index) => index.config.name),
    ).toContain('project_tags_tag_idx');
  });
});
