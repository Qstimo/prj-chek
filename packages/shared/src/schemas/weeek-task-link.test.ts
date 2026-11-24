import { describe, expect, it } from 'vitest';
import { isWeeekLink, weeekTaskLinkOf } from './weeek-task-link';

describe('weeekTaskLinkOf', () => {
  it('разбирает постоянную ссылку с параметрами и якорем', () => {
    expect(weeekTaskLinkOf('https://app.weeek.net/ws/4242/task/42/?source=link#top'))
      .toEqual({ workspaceId: '4242', taskId: '42' });
  });
  it('принимает адрес задачи на доске', () => {
    expect(weeekTaskLinkOf('https://app.weeek.net/ws/4242/board/11/42'))
      .toEqual({ workspaceId: '4242', taskId: '42' });
  });
  it('неполная ссылка Weeek тоже требует связывания вместо создания дубля', () => {
    expect(isWeeekLink('https://app.weeek.net/ws/4242/board/11')).toBe(true);
    expect(weeekTaskLinkOf('https://app.weeek.net/ws/4242/board/11')).toBeNull();
    expect(isWeeekLink('https://other.test/ws/4242/task/42')).toBe(false);
  });
  it.each([null, '', 'https://other.test/ws/1/task/2', 'http://app.weeek.net/ws/1/task/2',
    'https://app.weeek.net.evil.test/ws/1/task/2', 'https://x@app.weeek.net/ws/1/task/2',
    'https://app.weeek.net:8443/ws/1/task/2', 'https://app.weeek.net/ws/1/task/no-id'])
    ('не принимает чужой или некорректный адрес: %s', (url) => expect(weeekTaskLinkOf(url)).toBeNull());
});
