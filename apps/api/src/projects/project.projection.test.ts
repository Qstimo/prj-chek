import { AccessLevel, ProjectLifecycle, type Tag } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { projectProjection } from './project.projection';
import type { Project } from '../db/schema';

const project: Project = {
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'proekt',
  name: 'Проект',
  purpose: 'Назначение',
  stack: 'Next.js',
  repoUrl: 'https://example.com/repo',
  ownerUserId: null,
  lifecycle: ProjectLifecycle.Active,
  notes: 'Заметки',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
};

const tags: Tag[] = [{ id: '22222222-2222-2222-2222-222222222222', slug: 'web', label: 'Web' }];

describe('projectProjection', () => {
  describe('уровень метаданных', () => {
    const result = projectProjection(project, AccessLevel.Metadata, tags);

    it('отдаёт название и состояние', () => {
      expect(result).toMatchObject({ name: 'Проект', lifecycle: ProjectLifecycle.Active });
    });

    it('скрывает назначение, стек и заметки', () => {
      expect(result).not.toHaveProperty('purpose');
      expect(result).not.toHaveProperty('stack');
      expect(result).not.toHaveProperty('notes');
    });

    it('скрывает ссылку на репозиторий', () => {
      expect(result).not.toHaveProperty('repoUrl');
    });

    it('скрывает теги', () => {
      // Уровень метаданных раскрывает существование проекта, а не его
      // паспорт: тег стоит в одном ряду с назначением и стеком.
      expect(result).not.toHaveProperty('tags');
    });
  });

  describe('уровень чтения', () => {
    const result = projectProjection(project, AccessLevel.Read, tags);

    it('отдаёт все поля паспорта', () => {
      expect(result).toMatchObject({
        purpose: 'Назначение',
        stack: 'Next.js',
        repoUrl: 'https://example.com/repo',
        notes: 'Заметки',
        tags,
      });
    });

    it('без тегов отдаёт пустой набор, а не отсутствие поля', () => {
      // Иначе форме пришлось бы различать «тегов нет» и «поля нет».
      expect(projectProjection(project, AccessLevel.Read)).toMatchObject({ tags: [] });
    });

    it('отдаёт даты строками', () => {
      expect(typeof (result as { createdAt: unknown }).createdAt).toBe('string');
    });
  });

  describe('уровень записи', () => {
    it('отдаёт то же, что и чтение', () => {
      expect(projectProjection(project, AccessLevel.Write, tags)).toEqual(
        projectProjection(project, AccessLevel.Read, tags),
      );
    });
  });
});
