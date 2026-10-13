import { describe, expect, it } from 'vitest';

import { AccessLevel, Section } from '../enums';
import { userGrantRowSchema } from './grant';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';

describe('строка матрицы человека', () => {
  it('держит проект и его уровни', () => {
    const parsed = userGrantRowSchema.parse({
      projectId: PROJECT_ID,
      projectName: 'CAIRN',
      levels: { [Section.Info]: AccessLevel.Read },
    });

    expect(parsed.levels[Section.Info]).toBe(AccessLevel.Read);
  });

  it('принимает проект без уровней', () => {
    // Строка без выдач появляется, когда проект только что добавлен в матрицу.
    const parsed = userGrantRowSchema.parse({
      projectId: PROJECT_ID,
      projectName: 'CAIRN',
      levels: {},
    });

    expect(parsed.levels).toEqual({});
  });
});
