import { ProjectLifecycle, type ProjectListItem, type Tag } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { collectTagFacets, filterByTags, toggleTag } from './tagFilter';

const WEB: Tag = { id: 't1', slug: 'web', label: 'Web' };
const PRODUCT: Tag = { id: 't2', slug: 'product', label: 'Product' };
const INNER: Tag = { id: 't3', slug: 'внутренний', label: 'Внутренний' };

/** Строка сводки с заданными тегами. */
function project(name: string, tags: Tag[]): ProjectListItem {
  return {
    id: name,
    slug: name,
    name,
    lifecycle: ProjectLifecycle.Active,
    updatedAt: null,
    platforms: [],
    tags,
    productionDomain: null,
    productionServerName: null,
  };
}

describe('collectTagFacets', () => {
  it('считает, сколькими проектами взят каждый тег', () => {
    const facets = collectTagFacets([
      project('Касса', [WEB]),
      project('Витрина', [WEB, PRODUCT]),
    ]);

    expect(facets).toEqual([
      { slug: 'product', label: 'Product', count: 1 },
      { slug: 'web', label: 'Web', count: 2 },
    ]);
  });

  it('ставит кириллицу впереди латиницы', () => {
    // Тем же порядком, каким сервер отдаёт теги внутри проекта: иначе
    // чипы фильтра и чипы строки сводки читались бы по-разному.
    const facets = collectTagFacets([project('Касса', [WEB, INNER])]);

    expect(facets.map((facet) => facet.label)).toEqual(['Внутренний', 'Web']);
  });

  it('у проекта без тегов фильтру нечего собрать', () => {
    // Так же выглядит проект, чей паспорт субъекту не виден: сервер
    // отдаёт его без тегов, и в фильтр он ничего не добавляет.
    expect(collectTagFacets([project('Касса', [])])).toEqual([]);
  });
});

describe('filterByTags', () => {
  const projects = [
    project('Касса', [WEB]),
    project('Витрина', [WEB, PRODUCT]),
    project('Бот', []),
  ];

  it('без выбранных тегов отдаёт всё', () => {
    expect(filterByTags(projects, [])).toHaveLength(3);
  });

  it('отбирает по одному тегу', () => {
    expect(filterByTags(projects, ['web']).map((item) => item.name)).toEqual([
      'Касса',
      'Витрина',
    ]);
  });

  it('два тега отбирают пересечение, а не объединение', () => {
    // Выбрать «Web» и «Product» значит «веб-продукт»; объединение
    // отвечало бы на вопрос, которого никто не задавал.
    expect(filterByTags(projects, ['web', 'product']).map((item) => item.name)).toEqual([
      'Витрина',
    ]);
  });

  it('тег, которого ни у кого нет, даёт пустой список', () => {
    // Честно: подменять его полным списком значило бы соврать про
    // сохранённую ссылку.
    expect(filterByTags(projects, ['нет-такого'])).toEqual([]);
  });
});

describe('toggleTag', () => {
  it('добавляет невыбранный и убирает выбранный', () => {
    expect(toggleTag(['web'], 'product')).toEqual(['web', 'product']);
    expect(toggleTag(['web', 'product'], 'web')).toEqual(['product']);
  });
});
