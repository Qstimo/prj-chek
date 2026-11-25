import { SubjectKind } from '@cairn/shared';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { SessionGuard } from '../auth/session.guard';
import { SummariesController } from './summaries.controller';
import { SummariesService } from './summaries.service';
import { SummaryTaskTransferService } from './summary-task-transfer.service';

const projectId = '11111111-1111-4111-8111-111111111111';
const summaryId = '22222222-2222-4222-8222-222222222222';
const draftId = '33333333-3333-4333-8333-333333333333';
const subject = {
  id: projectId,
  kind: SubjectKind.User,
  label: 'User',
  isSuperadmin: false,
  isRevoked: false,
};
describe('HTTP: перенос выбранных строк саммари', () => {
  let app: INestApplication;
  const transfer = vi.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SummariesController],
      providers: [
        { provide: SummariesService, useValue: {} },
        { provide: SummaryTaskTransferService, useValue: { transfer } },
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
    transfer.mockResolvedValue({ taskIds: [projectId] });
  });
  const url = `/projects/${projectId}/summaries/${summaryId}/tasks/transfer`;
  it('передаёт субъект, проект, саммари и выбранные строки без полей задачи', async () => {
    await request(app.getHttpServer())
      .post(url)
      .send({ taskIds: [draftId] })
      .expect(201, { taskIds: [projectId] });
    expect(transfer).toHaveBeenCalledWith(subject, projectId, summaryId, { taskIds: [draftId] });
  });
  it('не принимает пустой выбор, чужие поля тела или негодные идентификаторы', async () => {
    for (const input of [
      { taskIds: [] },
      { taskIds: ['bad'] },
      { taskIds: [draftId], title: 'Подмена' },
      { taskIds: [draftId], projectId },
    ])
      await request(app.getHttpServer()).post(url).send(input).expect(400);
    expect(transfer).not.toHaveBeenCalled();
  });
});
