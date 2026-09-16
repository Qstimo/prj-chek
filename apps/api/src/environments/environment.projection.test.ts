import { AccessLevel, EnvironmentKind, type EnvironmentDetail } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { environmentProjection } from './environment.projection';
import type { Environment, Server } from '../db/schema';

const row: Environment = {
  id: '11111111-1111-1111-1111-111111111111',
  projectId: '22222222-2222-2222-2222-222222222222',
  name: 'Прод',
  kind: EnvironmentKind.Production,
  serverId: '33333333-3333-3333-3333-333333333333',
  healthCheckUrl: 'https://example.com/health',
  notes: 'Заметка',
  createdAt: new Date('2026-08-27T10:00:00Z'),
  updatedAt: new Date('2026-08-27T10:00:00Z'),
};

const server: Server = {
  id: '33333333-3333-3333-3333-333333333333',
  name: 'hetzner-fsn-1',
  owner: 'ООО Ромашка',
  host: 'srv-1.example.com',
  ip: '203.0.113.10',
  provider: 'Hetzner',
  specs: '2 vCPU, 4 ГБ',
  paidUntil: '2026-12-01',
  notes: 'Заметка о машине',
  createdAt: new Date('2026-08-27T10:00:00Z'),
  updatedAt: new Date('2026-08-27T10:00:00Z'),
};

const domains = ['example.com'];

describe('проекция окружения', () => {
  it('на уровне метаданных показывает имя, вид и домены', () => {
    const projected = environmentProjection(row, domains, AccessLevel.Metadata, server);

    expect(projected).toEqual({
      id: row.id,
      name: 'Прод',
      kind: EnvironmentKind.Production,
      domains: ['example.com'],
    });
  });

  it('на уровне метаданных не раскрывает машину вовсе', () => {
    // Домен виден каждому, кто откроет сайт; машина и её владелец — нет.
    const projected = environmentProjection(row, domains, AccessLevel.Metadata, server);

    expect('server' in projected).toBe(false);
    expect('notes' in projected).toBe(false);
  });

  it('на уровне чтения показывает машину вложенным объектом', () => {
    const projected = environmentProjection(
      row,
      domains,
      AccessLevel.Read,
      server,
    ) as EnvironmentDetail;

    expect(projected.server).toEqual({
      id: server.id,
      name: 'hetzner-fsn-1',
      owner: 'ООО Ромашка',
      host: 'srv-1.example.com',
      ip: '203.0.113.10',
      provider: 'Hetzner',
      specs: '2 vCPU, 4 ГБ',
    });
  });

  it('не раскрывает заметки о машине и срок её оплаты', () => {
    // Это данные реестра серверов, а не окружения: подрядчику они не нужны.
    const projected = environmentProjection(
      row,
      domains,
      AccessLevel.Read,
      server,
    ) as EnvironmentDetail;

    expect(projected.server).not.toHaveProperty('notes');
    expect(projected.server).not.toHaveProperty('paidUntil');
  });

  it('окружение без машины отдаёт пустую ссылку, а не отсутствие поля', () => {
    const projected = environmentProjection(
      { ...row, serverId: null },
      domains,
      AccessLevel.Read,
      null,
    ) as EnvironmentDetail;

    expect(projected.server).toBeNull();
  });

  it('не несёт отдельного адреса окружения: адрес — это домены', () => {
    const projected = environmentProjection(
      row,
      ['stage.example.com'],
      AccessLevel.Read,
      server,
    ) as EnvironmentDetail;

    expect(projected).not.toHaveProperty('host');
    expect(projected.domains).toEqual(['stage.example.com']);
    // Адрес машины при этом остаётся: это свойство сервера, а не окружения.
    expect(projected.server?.host).toBe('srv-1.example.com');
  });

  it('отдаёт время строками', () => {
    // Через HTTP уходит JSON, и дата обязана быть сериализуемой однозначно.
    const projected = environmentProjection(
      row,
      domains,
      AccessLevel.Read,
      server,
    ) as EnvironmentDetail;

    expect(projected.createdAt).toBe('2026-08-27T10:00:00.000Z');
  });
});
