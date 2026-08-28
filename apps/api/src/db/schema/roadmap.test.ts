import { RoadmapVersionState } from '@cairn/shared';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  roadmapCheckpoints,
  roadmapPublicLinks,
  roadmapVersionStateEnum,
  roadmapVersions,
} from './roadmap';

describe('версии роадмапа', () => {
  it('перечисление состояния совпадает с контрактом', () => {
    expect(roadmapVersionStateEnum.enumValues).toEqual(Object.values(RoadmapVersionState));
  });

  it('обозначение уникально в проекте', () => {
    const unique = getTableConfig(roadmapVersions).uniqueConstraints.find(
      (constraint) => constraint.name === 'roadmap_versions_project_label',
    );

    expect(unique?.columns.map((column) => column.name).sort()).toEqual(['label', 'project_id']);
  });
});

describe('чекпоинты', () => {
  it('нет исполнителей, оценок и дат', () => {
    // ТЗ 1.4: сознательное ограничение, удерживающее продукт от трекера.
    const columns = getTableConfig(roadmapCheckpoints).columns.map((column) => column.name);

    expect(columns).not.toContain('assignee');
    expect(columns).not.toContain('due_date');
    expect(columns).not.toContain('estimate');
    expect(columns).not.toContain('parent_id');
  });

  it('требует формулировку и признак', () => {
    expect(roadmapCheckpoints.title.notNull).toBe(true);
    expect(roadmapCheckpoints.isDone.notNull).toBe(true);
  });
});

describe('публичная ссылка', () => {
  it('у проекта не больше одной ссылки', () => {
    const unique = getTableConfig(roadmapPublicLinks).uniqueConstraints.find(
      (constraint) => constraint.name === 'roadmap_public_links_project',
    );

    expect(unique?.columns.map((column) => column.name)).toEqual(['project_id']);
  });

  it('токен уникален', () => {
    const unique = getTableConfig(roadmapPublicLinks).uniqueConstraints.find(
      (constraint) => constraint.name === 'roadmap_public_links_token',
    );

    expect(unique?.columns.map((column) => column.name)).toEqual(['token']);
  });
});
