import { AccessLevel, ChronicleSource, type ChronicleDetail } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { chronicleProjection } from './chronicle.projection';
import type { ChronicleEntry } from '../db/schema';

const row: ChronicleEntry = {
  id: '11111111-1111-1111-1111-111111111111',
  projectId: '22222222-2222-2222-2222-222222222222',
  occurredOn: '2026-08-27',
  title: 'Встреча по релизу',
  content: 'Решили выпускать в пятницу.',
  source: ChronicleSource.Webhook,
  createdBySubjectId: '33333333-3333-3333-3333-333333333333',
  createdAt: new Date('2026-08-27T10:00:00Z'),
  updatedAt: new Date('2026-08-27T10:00:00Z'),
};

describe('проекция записи хроники', () => {
  it('на уровне метаданных отдаёт дату, заголовок и источник', () => {
    expect(chronicleProjection(row, AccessLevel.Metadata)).toEqual({
      id: row.id,
      occurredOn: '2026-08-27',
      title: 'Встреча по релизу',
      source: ChronicleSource.Webhook,
    });
  });

  it('на уровне метаданных скрывает содержимое', () => {
    expect('content' in chronicleProjection(row, AccessLevel.Metadata)).toBe(false);
  });

  it('на уровне чтения отдаёт содержимое', () => {
    const projected = chronicleProjection(row, AccessLevel.Read) as ChronicleDetail;

    expect(projected.content).toBe('Решили выпускать в пятницу.');
    expect(projected.createdAt).toBe('2026-08-27T10:00:00.000Z');
  });
});
