import {
  AccessLevel,
  PlatformKind,
  ProjectLifecycle,
  Section,
  type PlatformRef,
  type Tag,
} from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import type { Project } from '../db/schema';
import { projectListItemProjection } from './project-list.projection';

const project = {
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'kassa',
  name: 'Касса',
  purpose: 'секрет',
  stack: null,
  repoUrl: null,
  ownerUserId: null,
  lifecycle: ProjectLifecycle.Active,
  notes: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-10-01T12:00:00.000Z'),
} as Project;

const platforms: PlatformRef[] = [
  { id: '22222222-2222-2222-2222-222222222222', kind: PlatformKind.Server, name: 'API' },
];

const tags: Tag[] = [
  { id: '33333333-3333-3333-3333-333333333333', slug: 'web', label: 'Web' },
];

describe('projectListItemProjection', () => {
  it('прячет паспортные и инфра-поля без выдач', () => {
    expect(
      projectListItemProjection(project, {}, platforms, tags, 'example.com', 'edge-1'),
    ).toMatchObject({
      updatedAt: null,
      platforms: [],
      tags: [],
      productionDomain: null,
      productionServerName: null,
    });
  });

  it('отдаёт поля по порогам Info и Infra', () => {
    expect(
      projectListItemProjection(
        project,
        {
          [Section.Info]: AccessLevel.Read,
          [Section.Infrastructure]: AccessLevel.Read,
        },
        platforms,
        tags,
        'example.com',
        'edge-1',
      ),
    ).toMatchObject({
      updatedAt: '2026-10-01T12:00:00.000Z',
      platforms,
      tags,
      productionDomain: 'example.com',
      productionServerName: 'edge-1',
    });
  });

  it('отдаёт теги уже на уровне метаданных «Инфо»', () => {
    // Тем же порогом, что платформы: по тегам фильтруется сводка, и
    // проект, чей паспорт виден хотя бы названием, обязан фильтроваться
    // вместе с остальными.
    expect(
      projectListItemProjection(
        project,
        { [Section.Info]: AccessLevel.Metadata },
        platforms,
        tags,
        null,
        null,
      ),
    ).toMatchObject({ updatedAt: null, tags });
  });

  it('при Infra Metadata отдаёт домен без имени сервера', () => {
    expect(
      projectListItemProjection(
        project,
        { [Section.Infrastructure]: AccessLevel.Metadata },
        platforms,
        tags,
        'example.com',
        'edge-1',
      ),
    ).toMatchObject({
      productionDomain: 'example.com',
      productionServerName: null,
    });
  });
});
