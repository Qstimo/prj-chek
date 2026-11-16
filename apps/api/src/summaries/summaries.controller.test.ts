import { AccessLevel, Section, SUMMARY_ALREADY_RELEASED, SUMMARY_TASKS_EMPTY, SUGGESTER_DISABLED, SUGGESTER_UNAVAILABLE, SUMMARY_TEXT_TOO_LONG } from '@cairn/shared';
import { describe, expect, it } from 'vitest';
import { SuggesterFailure } from './suggester/task-suggester';
import { summariesHttpFixture, SUMMARY_BODY } from '../../test/summaries-http-fixture';

describe('HTTP: саммари проекта', () => {
  const fixture = summariesHttpFixture();
  const base = () => `/projects/${fixture.state.projectId}/summaries`;

  it('создаёт 201, читает список и деталь, удаляет 204 без тела', async () => {
    const agent = await fixture.signIn();
    const created = await agent.post(base()).send(SUMMARY_BODY).expect(201);
    expect(created.body).toMatchObject({ ...SUMMARY_BODY, isReleased: false, tasks: [] });
    const list = await agent.get(base()).expect(200);
    expect(list.body).toHaveLength(1);
    await agent.get(`${base()}/${created.body.id}`).expect(200, created.body);
    await agent.delete(`${base()}/${created.body.id}`).expect(204, '');
    await agent.get(`${base()}/${created.body.id}`).expect(404);
  });

  it('сохраняет задачи, предлагает задачи с 200 и формирует релиз с 201', async () => {
    const agent = await fixture.signIn();
    const created = await agent.post(base()).send(SUMMARY_BODY).expect(201);
    const path = `${base()}/${created.body.id}`;
    await agent.put(`${path}/tasks`).send({ tasks: [{ title: 'Ручная' }] }).expect(200);
    const suggested = await agent.post(`${path}/tasks/suggest`).expect(200);
    expect(suggested.body.tasks[0].title).toBe('Предложенная задача');
    const released = await agent.post(`${path}/release`).send({ label: 'v1.0' }).expect(201);
    expect(released.body).toEqual({ versionId: expect.any(String), label: 'v1.0', checkpointCount: 1 });
    const duplicate = await agent.post(`${path}/release`).send({ label: 'v1.1' }).expect(409);
    expect(duplicate.body.code).toBe(SUMMARY_ALREADY_RELEASED);
  });

  it('пустой черновик отвечает 409 с кодом', async () => {
    const agent = await fixture.signIn();
    const created = await agent.post(base()).send(SUMMARY_BODY).expect(201);
    const response = await agent.post(`${base()}/${created.body.id}/release`).send({ label: 'v1' }).expect(409);
    expect(response.body.code).toBe(SUMMARY_TASKS_EMPTY);
  });

  it('проверяет строгие тела создания, черновика и версии общей схемой роадмапа', async () => {
    const agent = await fixture.signIn();
    await agent.post(base()).send({ ...SUMMARY_BODY, projectId: fixture.state.projectId }).expect(400);
    const created = await agent.post(base()).send(SUMMARY_BODY).expect(201);
    await agent.put(`${base()}/${created.body.id}/tasks`).send({ tasks: [{ title: 'Задача', position: 1 }] }).expect(400);
    await agent.post(`${base()}/${created.body.id}/release`).send({ label: '' }).expect(400);
  });

  it('без сессии — 401, без выдачи — 404, с чтением хроники — 403', async () => {
    await fixture.anonymous().get(base()).expect(401);
    const agent = await fixture.signIn('user@cairn.local');
    await agent.get(base()).expect(404);
    await fixture.grant(Section.Chronicle, AccessLevel.Read);
    await agent.post(base()).send(SUMMARY_BODY).expect(403);
  });

  it('саммари другого проекта и отдельная правка текста — 404, неверные UUID — 400', async () => {
    const agent = await fixture.signIn();
    const created = await agent.post(base()).send(SUMMARY_BODY).expect(201);
    await agent.get(`/projects/${fixture.state.otherProjectId}/summaries/${created.body.id}`).expect(404);
    await agent.patch(`${base()}/${created.body.id}/text`).send({ text: 'Правка' }).expect(404);
    await agent.get(`${base()}/не-uuid`).expect(400);
    await agent.get('/projects/не-uuid/summaries').expect(400);
  });

  it.each([[SUGGESTER_DISABLED, 409], [SUGGESTER_UNAVAILABLE, 502]])('отказ предложителя %s имеет статус %s', async (code, status) => {
    const agent = await fixture.signIn();
    const created = await agent.post(base()).send(SUMMARY_BODY).expect(201);
    fixture.suggester.suggest.mockRejectedValue(new SuggesterFailure(code, 'Безопасное сообщение'));
    const response = await agent.post(`${base()}/${created.body.id}/tasks/suggest`).expect(status);
    expect(response.body.code).toBe(code);
  });

  it('длинный текст — 409 с фактическим пределом', async () => {
    const agent = await fixture.signIn();
    const created = await agent.post(base()).send({ ...SUMMARY_BODY, text: 'я'.repeat(40_001) }).expect(201);
    const response = await agent.post(`${base()}/${created.body.id}/tasks/suggest`).expect(409);
    expect(response.body).toMatchObject({ code: SUMMARY_TEXT_TOO_LONG, maxChars: 40_000 });
  });

  it('выдачи релиза проверяются в текущем запросе: 404 раньше 403', async () => {
    const admin = await fixture.signIn();
    const created = await admin.post(base()).send(SUMMARY_BODY).expect(201);
    await fixture.grant(Section.Chronicle, AccessLevel.Read);
    const agent = await fixture.signIn('user@cairn.local');
    const path = `${base()}/${created.body.id}/release`;
    await agent.post(path).send({ label: 'v1' }).expect(404);
    await fixture.grant(Section.Roadmap, AccessLevel.Write);
    await agent.post(path).send({ label: 'v1' }).expect(403);
  });
});

