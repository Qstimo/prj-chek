import { describe, expect, it } from 'vitest';

import { IncidentEventKind, type IncidentEvent } from '../incidents/incidents.service';
import { notificationOf } from './notification-text';

const BASE: IncidentEvent = {
  kind: IncidentEventKind.Opened,
  domainId: '00000000-0000-0000-0000-000000000002',
  address: 'project.ru',
  projectId: '00000000-0000-0000-0000-000000000001',
  projectName: 'CAIRN',
  environmentName: 'прод',
  cause: 'HTTP 500',
  startedAt: new Date('2026-10-20T10:00:00Z'),
  resolvedAt: null,
};

describe('текст уведомления', () => {
  it('падение называет адрес в заголовке', () => {
    // Заголовок — единственное, что человек прочитает наверняка, и
    // чинить ему предстоит адрес, а не окружение.
    expect(notificationOf(BASE).title).toBe('project.ru не отвечает');
  });

  it('падение называет причину, проект и окружение', () => {
    expect(notificationOf(BASE).body).toBe('HTTP 500 · CAIRN · прод');
  });

  it('падение без причины не врёт о ней', () => {
    expect(notificationOf({ ...BASE, cause: null }).body).toBe('CAIRN · прод');
  });

  it('восстановление сообщает длительность', () => {
    const text = notificationOf({
      ...BASE,
      kind: IncidentEventKind.Resolved,
      resolvedAt: new Date('2026-10-20T10:40:00Z'),
    });

    expect(text.title).toBe('project.ru отвечает снова');
    expect(text.body).toBe('лежал 40 минут · CAIRN · прод');
  });

  it('длительность больше часа считается часами', () => {
    const text = notificationOf({
      ...BASE,
      kind: IncidentEventKind.Resolved,
      resolvedAt: new Date('2026-10-20T13:00:00Z'),
    });

    expect(text.body).toContain('лежал 3 часа');
  });

  it('падение короче минуты не превращается в ноль минут', () => {
    const text = notificationOf({
      ...BASE,
      kind: IncidentEventKind.Resolved,
      resolvedAt: new Date('2026-10-20T10:00:30Z'),
    });

    expect(text.body).toContain('меньше минуты');
  });

  it('метка равна адресу: новый пуш заменяет прежний', () => {
    // Иначе лоток забьётся повторами об одном и том же адресе.
    expect(notificationOf(BASE).tag).toBe(BASE.domainId);
  });

  it('ведёт на инфраструктуру проекта', () => {
    expect(notificationOf(BASE).url).toBe(`/projects/${BASE.projectId}/infrastructure`);
  });
});
