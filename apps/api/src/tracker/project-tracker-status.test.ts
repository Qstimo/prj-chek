import { TrackerKind } from '@cairn/shared';
import { describe, expect, it } from 'vitest';
import type { Database } from '../db/db.types';
import type { AuditService } from '../audit/audit.service';
import type { RequestSubject } from '../access/access.types';
import type { TaskExportsRepository } from './task-exports.repository';
import type { TrackerConnectionsRepository } from './tracker-connections.repository';
import type { TrackerBindingsRepository } from './tracker-bindings.repository';
import type { TrackerConnectionService } from './tracker-connection.service';
import type { TrackerSource } from './tracker';
import { TrackerService } from './tracker.service';

describe('готовность Weeek для настроек проекта', () => {
  it.each([false, true])('возвращает только признак сохранённого токена: %s', async (hasSecret) => {
    const service = new TrackerService(
      {} as Database,
      {} as TrackerConnectionsRepository,
      { findForProject: async () => null } as unknown as TrackerBindingsRepository,
      {} as TaskExportsRepository,
      {
        connection: async () => ({
          kind: TrackerKind.Weeek,
          hasSecret,
          isOperational: false,
          blockedBy: hasSecret ? 'disabled' : 'secret_missing',
          secret: 'never-return-this',
        }),
      } as unknown as TrackerConnectionService,
      {} as AuditService,
      {} as TrackerSource,
    );
    const result = await service.findForProject({} as RequestSubject, 'project');
    expect(result).toEqual({
      hasConnection: hasSecret,
      isOperational: false,
      blockedBy: hasSecret ? 'disabled' : 'secret_missing',
      binding: null,
    });
    expect(JSON.stringify(result)).not.toContain('never-return-this');
  });
});
