import { describe, expect, it } from 'vitest';

import { PlatformKind } from '../enums';
import { projectCreateSchema, projectUpdateSchema } from './project';

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
