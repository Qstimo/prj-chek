import { ProjectLifecycle } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { projectLifecycleEnum, projects } from './projects';

describe('проекты', () => {
  it('перечисление жизненного цикла совпадает с контрактом', () => {
    expect(projectLifecycleEnum.enumValues).toEqual(Object.values(ProjectLifecycle));
  });

  it('слаг уникален', () => {
    expect(projects.slug.isUnique).toBe(true);
  });

  it('допускает проект без ответственного', () => {
    // Ответственный — справочное поле и прав не даёт (спека 4.4).
    expect(projects.ownerUserId.notNull).toBe(false);
  });
});
