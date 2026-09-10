import { describe, expect, it } from 'vitest';

import { EnvironmentKind, ProjectLifecycle, StatusIndicator } from '../enums';
import {
  SERVER_WARN_DAYS,
  serverCreateSchema,
  serverDetailSchema,
  serverMapSchema,
  serverRowSchema,
  serverUpdateSchema,
} from './server';

const SERVER_ID = '11111111-1111-1111-1111-111111111111';
const PROJECT_ID = '22222222-2222-2222-2222-222222222222';
const ENVIRONMENT_ID = '33333333-3333-3333-3333-333333333333';

describe('порог предупреждения об оплате', () => {
  it('равен двум неделям', () => {
    expect(SERVER_WARN_DAYS).toBe(14);
  });
});

describe('схема создания сервера', () => {
  it('требует имя и обрезает его по краям', () => {
    const parsed = serverCreateSchema.parse({ name: '  hetzner-fsn-1 ' });

    expect(parsed.name).toBe('hetzner-fsn-1');
  });

  it('отвергает пустое имя', () => {
    expect(() => serverCreateSchema.parse({ name: '   ' })).toThrow();
  });

  it('принимает дату оплаты календарным днём', () => {
    const parsed = serverCreateSchema.parse({ name: 'srv', paidUntil: '2026-10-12' });

    expect(parsed.paidUntil).toBe('2026-10-12');
  });

  it('отвергает дату с часом и дату в другом порядке', () => {
    expect(() => serverCreateSchema.parse({ name: 'srv', paidUntil: '2026-10-12T00:00:00Z' })).toThrow();
    expect(() => serverCreateSchema.parse({ name: 'srv', paidUntil: '12.10.2026' })).toThrow();
  });

  it('отвергает владельца длиннее двухсот символов', () => {
    expect(() => serverCreateSchema.parse({ name: 'srv', owner: 'о'.repeat(201) })).toThrow();
  });

  it('проверяет IP как адрес', () => {
    expect(() => serverCreateSchema.parse({ name: 'srv', ip: 'не адрес' })).toThrow();
    expect(serverCreateSchema.parse({ name: 'srv', ip: '10.0.0.1' }).ip).toBe('10.0.0.1');
  });

  it('позволяет очистить срок оплаты', () => {
    expect(serverCreateSchema.parse({ name: 'srv', paidUntil: null }).paidUntil).toBeNull();
  });
});

describe('схема правки сервера', () => {
  it('принимает пустой объект', () => {
    expect(serverUpdateSchema.parse({})).toEqual({});
  });
});

describe('схема строки реестра', () => {
  it('собирается с агрегатами и предупреждениями', () => {
    const parsed = serverRowSchema.parse({
      id: SERVER_ID,
      name: 'hetzner-fsn-1',
      owner: 'ООО Ромашка',
      host: 'fsn1.example.com',
      ip: '10.0.0.1',
      provider: 'Hetzner',
      specs: '4 vCPU, 8 ГБ',
      paidUntil: '2026-10-12',
      notes: null,
      indicator: StatusIndicator.Warning,
      warnings: [{ kind: 'server_expiring', subject: 'hetzner-fsn-1', detail: 'оплачен до 12.10.2026' }],
      projectCount: 2,
      environmentCount: 3,
      createdAt: '2026-09-10T10:00:00.000Z',
      updatedAt: '2026-09-10T10:00:00.000Z',
    });

    expect(parsed.projectCount).toBe(2);
    expect(parsed.warnings[0]?.kind).toBe('server_expiring');
  });
});

describe('схема деталей сервера', () => {
  it('перечисляет окружения с именами проектов', () => {
    const parsed = serverDetailSchema.parse({
      id: SERVER_ID,
      name: 'hetzner-fsn-1',
      owner: null,
      host: null,
      ip: null,
      provider: null,
      specs: null,
      paidUntil: null,
      notes: null,
      indicator: StatusIndicator.Unknown,
      warnings: [],
      projectCount: 1,
      environmentCount: 1,
      createdAt: '2026-09-10T10:00:00.000Z',
      updatedAt: '2026-09-10T10:00:00.000Z',
      environments: [
        {
          id: ENVIRONMENT_ID,
          name: 'Прод',
          kind: EnvironmentKind.Production,
          projectId: PROJECT_ID,
          projectName: 'Витрина',
          health: null,
        },
      ],
    });

    expect(parsed.environments[0]?.projectName).toBe('Витрина');
  });
});

describe('схема карты размещения', () => {
  it('собирается на образце с одним ребром', () => {
    const parsed = serverMapSchema.parse({
      servers: [
        {
          id: SERVER_ID,
          name: 'hetzner-fsn-1',
          owner: null,
          indicator: StatusIndicator.Ok,
          paidUntil: null,
          warnings: [],
        },
      ],
      projects: [
        {
          id: PROJECT_ID,
          name: 'Витрина',
          lifecycle: ProjectLifecycle.Active,
          indicator: StatusIndicator.Ok,
        },
      ],
      edges: [
        {
          serverId: SERVER_ID,
          projectId: PROJECT_ID,
          environments: [{ id: ENVIRONMENT_ID, name: 'Прод', kind: EnvironmentKind.Production }],
        },
      ],
    });

    expect(parsed.edges[0]?.environments).toHaveLength(1);
  });
});
