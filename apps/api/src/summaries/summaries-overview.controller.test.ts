import { AccessLevel, Section, taskSuggesterInfoSchema } from '@cairn/shared';
import { describe, expect, it } from 'vitest';
import { summariesHttpFixture, SUMMARY_BODY } from '../../test/summaries-http-fixture';

describe('HTTP: обзор саммари', () => {
  const fixture = summariesHttpFixture();

  it('история и цели включают только проекты с записью хроники', async () => {
    const admin = await fixture.signIn();
    for (const projectId of [fixture.state.projectId, fixture.state.otherProjectId]) {
      await admin.post(`/projects/${projectId}/summaries`).send(SUMMARY_BODY).expect(201);
    }
    await fixture.grant(Section.Chronicle, AccessLevel.Write);
    await fixture.grant(Section.Chronicle, AccessLevel.Read, fixture.state.otherProjectId);
    const member = await fixture.signIn('user@cairn.local');
    const history = await member.get('/summaries').expect(200);
    expect(history.body.map((row: { projectId: string }) => row.projectId)).toEqual([fixture.state.projectId]);
    const targets = await member.get('/summaries/projects').expect(200);
    expect(targets.body).toEqual([{ id: fixture.state.projectId, slug: 'proekt', name: 'Проект', lifecycle: 'development' }]);
  });

  it('без подходящих проектов возвращает пустые списки', async () => {
    const member = await fixture.signIn('user@cairn.local');
    await member.get('/summaries').expect(200, []);
    await member.get('/summaries/projects').expect(200, []);
  });

  it('суперадмин видит все цели без выдач', async () => {
    const admin = await fixture.signIn();
    const response = await admin.get('/summaries/projects').expect(200);
    expect(response.body).toHaveLength(2);
  });

  it('настройки доступны вошедшему и содержат только публичный контракт', async () => {
    const member = await fixture.signIn('user@cairn.local');
    const response = await member.get('/summaries/suggester').expect(200);
    expect(response.body).toEqual({ isEnabled: true, kind: 'local', host: 'llm.internal', model: 'тест', maxChars: 40_000 });
    expect(taskSuggesterInfoSchema.parse(response.body)).toEqual(response.body);
  });

  it.each(['/summaries', '/summaries/projects', '/summaries/suggester'])('без сессии %s отвечает 401', async (path) => {
    await fixture.anonymous().get(path).expect(401);
  });
});


