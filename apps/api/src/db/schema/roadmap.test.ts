import { RoadmapVersionState } from '@cairn/shared';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  roadmapCheckpoints,
  roadmapPublicLinks,
  roadmapReportPublicLinks,
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

  it('помнит версию, из которой чекпоинт перенесли', () => {
    // Нужна отчёту: «перенесено в v1.3» в отчёте v1.2 иначе не собрать.
    // Перенос не делает чекпоинт задачей трекера — меняется только
    // принадлежность версии (ТЗ 1.4), что и проверяет сосед выше.
    const columns = getTableConfig(roadmapCheckpoints).columns.map((column) => column.name);

    expect(columns).toContain('carried_from_version_id');
    expect(roadmapCheckpoints.carriedFromVersionId.notNull).toBe(false);
  });

  it('удаление версии-источника гасит пометку, а не запирает версию', () => {
    // `restrict` сделал бы версию неудаляемой из-за чекпоинта, который
    // в ней уже не лежит.
    const key = getTableConfig(roadmapCheckpoints).foreignKeys.find((candidate) =>
      candidate
        .reference()
        .columns.some((column) => column.name === 'carried_from_version_id'),
    );

    expect(key?.onDelete).toBe('set null');
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

describe('публичная ссылка на отчёт', () => {
  it('висит на версии, а не на проекте', () => {
    // Общая со всем роадмапом ссылка раскрыла бы заодно все остальные
    // версии и планы: отчёт публикуют по одной выпущенной версии.
    const columns = getTableConfig(roadmapReportPublicLinks).columns.map((column) => column.name);

    expect(columns).toContain('version_id');
    expect(columns).not.toContain('project_id');
  });

  it('у версии не больше одной ссылки', () => {
    const unique = getTableConfig(roadmapReportPublicLinks).uniqueConstraints.find(
      (constraint) => constraint.name === 'roadmap_report_public_links_version',
    );

    expect(unique?.columns.map((column) => column.name)).toEqual(['version_id']);
  });

  it('токен уникален', () => {
    const unique = getTableConfig(roadmapReportPublicLinks).uniqueConstraints.find(
      (constraint) => constraint.name === 'roadmap_report_public_links_token',
    );

    expect(unique?.columns.map((column) => column.name)).toEqual(['token']);
  });

  it('не удаляется каскадом вместе с версией', () => {
    // Ссылку снимает репозиторий явно, в той же транзакции: каскад унёс бы
    // опубликованный отчёт молча.
    const [key] = getTableConfig(roadmapReportPublicLinks).foreignKeys;

    expect(key?.onDelete).toBe('restrict');
  });
});
