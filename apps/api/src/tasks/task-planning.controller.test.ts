import { SubjectKind } from '@cairn/shared';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionGuard } from '../auth/session.guard';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

const projectId = '11111111-1111-4111-8111-111111111111';
const taskId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const subject = {
  id: projectId,
  kind: SubjectKind.User,
  label: 'User',
  isSuperadmin: false,
  isRevoked: false,
};

describe('HTTP: релиз и правило завершения задачи', () => {
  let app: INestApplication;
  const plan = vi.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        { provide: TasksService, useValue: { plan, findForProject: async () => [{ id: taskId }] } },
      ],
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
    vi.clearAllMocks();
  });
  const url = `/projects/${projectId}/tasks/${taskId}/planning`;
  it('передаёт субъект, релиз, выполнение и явное правило одной операцией', async () => {
    const input = { versionId, isDone: false, completionRule: { boardId: '11', columnId: '32' } };
    await request(app.getHttpServer()).put(url).send(input).expect(200);
    expect(plan).toHaveBeenCalledWith(subject, projectId, taskId, input);
  });
  it('отвергает неверные id, пустую колонку и лишние поля до записи', async () => {
    for (const input of [
      { versionId: 'bad' },
      { versionId, completionRule: { boardId: '11', columnId: '' } },
      { versionId, projectId: 'other' },
    ]) {
      await request(app.getHttpServer()).put(url).send(input).expect(400);
    }
    expect(plan).not.toHaveBeenCalled();
  });
  it('принимает отключение правила и снятие релиза', async () => {
    await request(app.getHttpServer())
      .put(url)
      .send({ versionId: null, completionRule: null })
      .expect(200);
    expect(plan).toHaveBeenCalledWith(subject, projectId, taskId, {
      versionId: null,
      completionRule: null,
    });
  });
});
