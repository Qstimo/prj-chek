import { describe, expect, it } from 'vitest';

import { IncidentEventKind, type IncidentEvent } from '../incidents/incidents.service';
import { notificationOf, stormNotificationOf } from './notification-text';

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

describe('сводное уведомление', () => {
  it('падение многих адресов считает их и склоняет', () => {
    expect(stormNotificationOf(IncidentEventKind.Opened, 12).title).toBe('Не отвечает 12 адресов');
  });

  it('склонение по числу', () => {
    expect(stormNotificationOf(IncidentEventKind.Opened, 4).title).toBe('Не отвечает 4 адреса');
    expect(stormNotificationOf(IncidentEventKind.Opened, 21).title).toBe('Не отвечает 21 адрес');
  });

  it('массовое восстановление тоже сводится', () => {
    expect(stormNotificationOf(IncidentEventKind.Resolved, 7).title).toBe(
      'Отвечают снова 7 адресов',
    );
  });

  it('ведёт на сводку, где предупреждения уже перечислены', () => {
    expect(stormNotificationOf(IncidentEventKind.Opened, 5).url).toBe('/');
  });

  it('метка одна на вид события: вторая сводка заменяет первую', () => {
    // Иначе лоток забьётся сводками об одной и той же аварии.
    expect(stormNotificationOf(IncidentEventKind.Opened, 5).tag).toBe(
      stormNotificationOf(IncidentEventKind.Opened, 9).tag,
    );
    expect(stormNotificationOf(IncidentEventKind.Opened, 5).tag).not.toBe(
      stormNotificationOf(IncidentEventKind.Resolved, 5).tag,
    );
  });
});
