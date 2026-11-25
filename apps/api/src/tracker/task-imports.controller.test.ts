import { SubjectKind } from '@cairn/shared';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionGuard } from '../auth/session.guard';
import { TaskImportsController } from './task-imports.controller';
import { TaskImportsService } from './task-imports.service';

const projectId = '11111111-1111-4111-8111-111111111111';
const subject = {
  id: projectId,
  kind: SubjectKind.User,
  label: 'User',
  isSuperadmin: false,
  isRevoked: false,
};
describe('HTTP: выбор и подтверждение импорта Weeek', () => {
  let app: INestApplication;
  const preview = vi.fn();
  const importTasks = vi.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TaskImportsController],
      providers: [{ provide: TaskImportsService, useValue: { preview, import: importTasks } }],
    })
      .overrideGuard(SessionGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { subject: unknown } };
        }) => {
          context.switchToHttp().getRequest().subject = subject;
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    vi.resetAllMocks();
    preview.mockResolvedValue({ tasks: [], people: [], peopleAvailable: true, truncated: false });
    importTasks.mockResolvedValue([]);
  });
  const url = `/projects/${projectId}/tasks/import`;

  it('передаёт проверенные фильтры и субъекта службе', async () => {
    await request(app.getHttpServer())
      .get(`${url}?boardId=11&status=completed&dateField=createdAt&dateFrom=2026-11-01`)
      .expect(200);
    expect(preview).toHaveBeenCalledWith(subject, projectId, {
      boardId: '11',
      status: 'completed',
      dateField: 'createdAt',
      dateFrom: '2026-11-01',
    });
  });
  it('отказывает некорректному диапазону до обращения в трекер', async () => {
    await request(app.getHttpServer())
      .get(`${url}?boardId=11&dateFrom=2026-11-25&dateTo=2026-11-01`)
      .expect(400);
    expect(preview).not.toHaveBeenCalled();
  });
  it('не принимает формулировки и происхождение из браузера', async () => {
    await request(app.getHttpServer())
      .post(url)
      .send({ boardId: '11', externalIds: ['42'], title: 'Подмена', origin: 'tracker' })
      .expect(400);
    expect(importTasks).not.toHaveBeenCalled();
  });
  it('отказывает набору больше 50 и повторяющимся id', async () => {
    await request(app.getHttpServer())
      .post(url)
      .send({ boardId: '11', externalIds: Array.from({ length: 51 }, (_, i) => String(i + 1)) })
      .expect(400);
    await request(app.getHttpServer())
      .post(url)
      .send({ boardId: '11', externalIds: ['42', '42'] })
      .expect(400);
    expect(importTasks).not.toHaveBeenCalled();
  });
  it('подтверждение принимает только доску и выбранные id', async () => {
    await request(app.getHttpServer())
      .post(url)
      .send({ boardId: '11', externalIds: ['42'] })
      .expect(201);
    expect(importTasks).toHaveBeenCalledWith(subject, projectId, {
      boardId: '11',
      externalIds: ['42'],
    });
  });
});
