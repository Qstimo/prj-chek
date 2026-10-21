import { AccessLevel, Section, SubjectKind, type PushSubscribeRequest } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccessService } from '../access/access.service';
import { grants, projects, subjects, users } from '../db/schema';
import { IncidentEventKind, type IncidentEvent } from '../incidents/incidents.service';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';
import { STORM_THRESHOLD } from './constants';
import { PushNotifier } from './push.notifier';
import { PushRepository } from './push.repository';
import { PushSender, type PushTransport } from './push.sender';

const SUBSCRIPTION: PushSubscribeRequest = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  p256dh: 'ключ',
  auth: 'секрет',
};

describe('уведомитель', () => {
  let testDb: TestDatabase;
  let notifier: PushNotifier;
  let push: PushRepository;
  let transport: ReturnType<typeof vi.fn>;
  let projectId: string;
  let adminSubjectId: string;
  let adminUserId: string;
  let contractorSubjectId: string;
  let otherProjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    push = new PushRepository(testDb.db);
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();
    transport = vi.fn().mockResolvedValue(undefined);
    notifier = new PushNotifier(
      new AccessService(testDb.db),
      push,
      new PushSender(transport as unknown as PushTransport),
    );

    const [admin] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    adminSubjectId = admin!.id;
    const [adminUser] = await testDb.db
      .insert(users)
      .values({
        subjectId: adminSubjectId,
        email: 'admin@cairn.local',
        passwordHash: 'хэш',
        isSuperadmin: true,
      })
      .returning();
    adminUserId = adminUser!.id;

    const [contractor] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'подрядчик' })
      .returning();
    contractorSubjectId = contractor!.id;
    await testDb.db
      .insert(users)
      .values({ subjectId: contractorSubjectId, email: 'c@cairn.local', passwordHash: 'хэш' });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'CAIRN' })
      .returning();
    projectId = project!.id;

    const [other] = await testDb.db
      .insert(projects)
      .values({ slug: 'drugoy', name: 'Другой' })
      .returning();
    otherProjectId = other!.id;
  });

  /** Выдаёт подрядчику уровень на секции проекта. */
  async function grant(section: Section, level: AccessLevel): Promise<void> {
    await testDb.db.insert(grants).values({
      subjectId: contractorSubjectId,
      projectId,
      section,
      level,
      grantedBy: adminUserId,
    });
  }

  /** Событие падения адреса проекта. */
  const openedEvent = (): IncidentEvent => ({
    kind: IncidentEventKind.Opened,
    domainId: '00000000-0000-0000-0000-000000000002',
    address: 'project.ru',
    projectId,
    projectName: 'CAIRN',
    environmentName: 'прод',
    cause: 'HTTP 500',
    startedAt: new Date('2026-10-20T10:00:00Z'),
    resolvedAt: null,
  });

  /** Событие восстановления того же адреса. */
  const resolvedEvent = (): IncidentEvent => ({
    ...openedEvent(),
    kind: IncidentEventKind.Resolved,
    resolvedAt: new Date('2026-10-20T10:40:00Z'),
  });

  it('падение уходит подписчику с доступом к инфраструктуре', async () => {
    await grant(Section.Infrastructure, AccessLevel.Metadata);
    await push.save(contractorSubjectId, SUBSCRIPTION);

    await notifier.notify([openedEvent()]);

    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.parse(transport.mock.calls[0]![1] as string).title).toContain('не отвечает');
  });

  it('подписчик без доступа к проекту не получает ничего', async () => {
    await push.save(contractorSubjectId, SUBSCRIPTION);

    await notifier.notify([openedEvent()]);

    expect(transport).not.toHaveBeenCalled();
  });

  it('мёртвая подписка удаляется', async () => {
    await grant(Section.Infrastructure, AccessLevel.Metadata);
    await push.save(contractorSubjectId, SUBSCRIPTION);
    transport.mockRejectedValue(Object.assign(new Error('нет'), { statusCode: 410 }));

    await notifier.notify([openedEvent()]);

    expect(await push.forSubjects([contractorSubjectId])).toHaveLength(0);
  });

  it('отказ службы подписку оставляет', async () => {
    await grant(Section.Infrastructure, AccessLevel.Metadata);
    await push.save(contractorSubjectId, SUBSCRIPTION);
    transport.mockRejectedValue(Object.assign(new Error('занято'), { statusCode: 503 }));

    await notifier.notify([openedEvent()]);

    expect(await push.forSubjects([contractorSubjectId])).toHaveLength(1);
  });

  it('отказ одной подписки не мешает второй', async () => {
    await grant(Section.Infrastructure, AccessLevel.Metadata);
    await push.save(contractorSubjectId, SUBSCRIPTION);
    await push.save(adminSubjectId, { ...SUBSCRIPTION, endpoint: 'https://push/2' });
    transport.mockRejectedValueOnce(new Error('первая не вышла'));

    await notifier.notify([openedEvent()]);

    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('два события дают два пуша', async () => {
    await push.save(adminSubjectId, SUBSCRIPTION);

    await notifier.notify([openedEvent(), resolvedEvent()]);

    expect(transport).toHaveBeenCalledTimes(2);
  });
  /** Несколько падений разных адресов одного проекта. */
  function openedEvents(count: number, project = projectId): IncidentEvent[] {
    return Array.from({ length: count }, (_, index) => ({
      ...openedEvent(),
      projectId: project,
      domainId: `00000000-0000-0000-0000-0000000000${(index + 16).toString(16)}`,
      address: `a${index}.project.ru`,
    }));
  }

  describe('шторм', () => {
    it('до порога включительно уведомления идут по одному', async () => {
      await push.save(adminSubjectId, SUBSCRIPTION);

      await notifier.notify(openedEvents(STORM_THRESHOLD));

      expect(transport).toHaveBeenCalledTimes(STORM_THRESHOLD);
    });

    it('больше порога — одна сводка вместо многих уведомлений', async () => {
      await push.save(adminSubjectId, SUBSCRIPTION);

      await notifier.notify(openedEvents(STORM_THRESHOLD + 1));

      expect(transport).toHaveBeenCalledTimes(1);
      expect(JSON.parse(transport.mock.calls[0]![1] as string).title).toContain('Не отвечает');
    });

    it('падения и восстановления сводятся порознь', async () => {
      // Двенадцать упало и одно поднялось — сводка о падении и отдельное
      // уведомление о восстановлении: смешивать их в одно число нельзя.
      await push.save(adminSubjectId, SUBSCRIPTION);

      await notifier.notify([...openedEvents(STORM_THRESHOLD + 1), resolvedEvent()]);

      expect(transport).toHaveBeenCalledTimes(2);
    });

    it('число в сводке считается по видимым человеку проектам', async () => {
      // Иначе текст раскрыл бы подрядчику масштаб аварии в чужих проектах.
      await grant(Section.Infrastructure, AccessLevel.Metadata);
      await push.save(contractorSubjectId, SUBSCRIPTION);

      await notifier.notify([
        ...openedEvents(STORM_THRESHOLD + 1),
        ...openedEvents(5, otherProjectId),
      ]);

      expect(JSON.parse(transport.mock.calls[0]![1] as string).title).toContain(
        String(STORM_THRESHOLD + 1),
      );
    });

    it('кто не видит ни одного затронутого проекта, сводки не получает', async () => {
      await push.save(contractorSubjectId, SUBSCRIPTION);

      await notifier.notify(openedEvents(STORM_THRESHOLD + 1));

      expect(transport).not.toHaveBeenCalled();
    });
  });
});
