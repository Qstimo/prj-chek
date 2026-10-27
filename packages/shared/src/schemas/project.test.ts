import { describe, expect, it } from 'vitest';

import { PlatformKind, ProjectLifecycle } from '../enums';
import {
  projectCreateSchema,
  projectListItemSchema,
  projectUpdateSchema,
} from './project';

describe('платформы проекта', () => {
  it('платформы принимаются при создании и отвергаются в правке', () => {
    // Правка стала строгой намеренно: без этого присланные платформы
    // молча отбросились бы — ровно та тихая потеря, от которой строгие
    // схемы и защищают.
    expect(
      projectCreateSchema.parse({
        name: 'Касса',
        platforms: [{ kind: PlatformKind.Server, name: 'API' }],
      }).platforms,
    ).toHaveLength(1);

    expect(() =>
      projectUpdateSchema.parse({ platforms: [{ kind: PlatformKind.Server, name: 'API' }] }),
    ).toThrow();
  });
});

describe('projectListItemSchema', () => {
  it('принимает обзор с nullable-полями секций', () => {
    expect(
      projectListItemSchema.parse({
        id: '11111111-1111-1111-1111-111111111111',
        slug: 'kassa',
        name: 'Касса',
        lifecycle: ProjectLifecycle.Active,
        updatedAt: null,
        platforms: [],
        productionDomain: null,
        productionServerName: null,
      }),
    ).toMatchObject({ updatedAt: null, platforms: [] });
  });
});
