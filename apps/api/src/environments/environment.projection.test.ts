import { AccessLevel, EnvironmentKind, type EnvironmentDetail } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { environmentProjection } from './environment.projection';
import type { Environment } from '../db/schema';

const row: Environment = {
  id: '11111111-1111-1111-1111-111111111111',
  projectId: '22222222-2222-2222-2222-222222222222',
  name: 'Прод',
  kind: EnvironmentKind.Production,
  host: 'srv-1.example.com',
  ip: '203.0.113.10',
  provider: 'Hetzner',
  specs: '2 vCPU, 4 ГБ',
  healthCheckUrl: 'https://example.com/health',
  notes: 'Заметка',
  createdAt: new Date('2026-08-27T10:00:00Z'),
  updatedAt: new Date('2026-08-27T10:00:00Z'),
};

const domains = ['example.com'];

describe('проекция окружения', () => {
  it('на уровне метаданных показывает имя, вид и домены', () => {
    const projected = environmentProjection(row, domains, AccessLevel.Metadata);

    expect(projected).toEqual({
      id: row.id,
      name: 'Прод',
      kind: EnvironmentKind.Production,
      domains: ['example.com'],
    });
  });

  it('на уровне метаданных скрывает серверные параметры', () => {
    // Домен виден каждому, кто откроет сайт; IP и провайдер — нет (спека 4).
    const projected = environmentProjection(row, domains, AccessLevel.Metadata);

    expect('ip' in projected).toBe(false);
    expect('provider' in projected).toBe(false);
    expect('notes' in projected).toBe(false);
  });

  it('на уровне чтения показывает серверные параметры', () => {
    const projected = environmentProjection(row, domains, AccessLevel.Read) as EnvironmentDetail;

    expect(projected.ip).toBe('203.0.113.10');
    expect(projected.host).toBe('srv-1.example.com');
    expect(projected.healthCheckUrl).toBe('https://example.com/health');
  });

  it('отдаёт время строками', () => {
    // Через HTTP уходит JSON, и дата обязана быть сериализуемой однозначно.
    const projected = environmentProjection(row, domains, AccessLevel.Read) as EnvironmentDetail;

    expect(projected.createdAt).toBe('2026-08-27T10:00:00.000Z');
  });
});
