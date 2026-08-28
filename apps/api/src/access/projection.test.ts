import { AccessLevel } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { projectByLevel } from './projection';

describe('projectByLevel', () => {
  const metadata = { id: '1', name: 'Прод' };
  const details = { ip: '203.0.113.10' };

  it('на уровне метаданных отдаёт только метаданные', () => {
    expect(projectByLevel(AccessLevel.Metadata, metadata, () => details)).toEqual(metadata);
  });

  it('на уровне чтения добавляет подробности', () => {
    expect(projectByLevel(AccessLevel.Read, metadata, () => details)).toEqual({
      ...metadata,
      ...details,
    });
  });

  it('на уровне записи отдаёт то же, что на чтении', () => {
    // Запись отличается правом менять, а не составом видимых полей (ТЗ 4.3).
    expect(projectByLevel(AccessLevel.Write, metadata, () => details)).toEqual({
      ...metadata,
      ...details,
    });
  });

  it('не вычисляет подробности на уровне метаданных', () => {
    // Подробности могут стоить запроса в базу или расшифровки (этап 4),
    // и делать эту работу ради выброшенного результата нельзя.
    let calls = 0;

    projectByLevel(AccessLevel.Metadata, metadata, () => {
      calls += 1;

      return details;
    });

    expect(calls).toBe(0);
  });
});
