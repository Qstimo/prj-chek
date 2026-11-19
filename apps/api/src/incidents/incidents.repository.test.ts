import {
  EnvironmentKind,
  INCIDENT_WINDOW_DAYS,
  Section,
  SubjectKind,
  AccessLevel,
} from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { SectionNotVisibleError } from '../access/access.errors';
import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import {
  addressIncidents,
  domains,
  environmentDomains,
  environments,
  grants,
  projects,
  subjects,
  users,
} from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';
import { PAST_INCIDENTS_LIMIT } from './constants';
import { IncidentsRepository } from './incidents.repository';

/** Сутки в миллисекундах: окна и отрезки считаются от «сейчас». */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Зафиксированное «сейчас»: иначе доля времени плавала бы между прогонами. */
const NOW = new Date('2026-11-16T12:00:00.000Z');

describe('репозиторий инцидентов', () => {
  let testDb: TestDatabase;
  let repository: IncidentsRepository;
  let projectId: string;
  let adminSubjectId: string;
  let adminUserId: string;
  let outsiderSubjectId: string;
  let domainId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new IncidentsRepository(testDb.db, new AccessService(testDb.db));
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

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

    const [outsider] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'outsider@cairn.local' })
      .returning();
    outsiderSubjectId = outsider!.id;
    await testDb.db
      .insert(users)
      .values({ subjectId: outsiderSubjectId, email: 'outsider@cairn.local', passwordHash: 'х' });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'CAIRN' })
      .returning();
    projectId = project!.id;

    // Чужому проект виден — но не секция инфраструктуры: иначе тест на
    // 404 проверял бы невидимость проекта, а не секции.
    await testDb.db.insert(grants).values({
      subjectId: outsiderSubjectId,
      projectId,
      section: Section.Roadmap,
      level: AccessLevel.Read,
      grantedBy: adminUser!.id,
    });

    const [environment] = await testDb.db
      .insert(environments)
      .values({ projectId, name: 'прод', kind: EnvironmentKind.Production })
      .returning();
    const [root] = await testDb.db.insert(domains).values({ name: 'project.ru' }).returning();
    const [address] = await testDb.db
      .insert(environmentDomains)
      .values({ environmentId: environment!.id, domainId: root!.id, name: 'project.ru' })
      .returning();
    domainId = address!.id;
  });

  const superadmin = (): RequestSubject => ({
    id: adminSubjectId,
    kind: SubjectKind.User,
    label: 'admin@cairn.local',
    isSuperadmin: true,
    isRevoked: false,
  });

  const outsider = (): RequestSubject => ({
    id: outsiderSubjectId,
    kind: SubjectKind.User,
    label: 'outsider@cairn.local',
    isSuperadmin: false,
    isRevoked: false,
  });

  /** Падение синтетическим отрезком: прогон здесь не участвует. */
  async function fall(
    startedAt: Date,
    resolvedAt: Date | null,
    options: { domain?: string; cause?: string } = {},
  ): Promise<string> {
    const [row] = await testDb.db
      .insert(addressIncidents)
      .values({
        domainId: options.domain ?? domainId,
        startedAt,
        resolvedAt,
        cause: options.cause ?? null,
      })
      .returning();

    return row!.id;
  }

  /** Момент на столько суток и часов раньше зафиксированного «сейчас». */
  function before(days: number, hours = 0): Date {
    return new Date(NOW.getTime() - days * DAY_MS - hours * 60 * 60 * 1000);
  }

  /** Второй проект со своим адресом: для проверки «чужой адрес — 404». */
  async function otherProjectAddress(): Promise<string> {
    const [other] = await testDb.db
      .insert(projects)
      .values({ slug: 'drugoy', name: 'Другой' })
      .returning();
    const [environment] = await testDb.db
      .insert(environments)
      .values({ projectId: other!.id, name: 'прод', kind: EnvironmentKind.Production })
      .returning();
    const [root] = await testDb.db.insert(domains).values({ name: 'other.ru' }).returning();
    const [address] = await testDb.db
      .insert(environmentDomains)
      .values({ environmentId: environment!.id, domainId: root!.id, name: 'other.ru' })
      .returning();

    return address!.id;
  }

  it('открывает инцидент с причиной', async () => {
    const incident = await repository.open(domainId, 'HTTP 500');

    expect(incident.cause).toBe('HTTP 500');
    expect(incident.resolvedAt).toBeNull();
  });

  it('второй открытый инцидент на адрес не заводится', async () => {
    // База держит это сама: частичный уникальный индекс.
    await repository.open(domainId, 'таймаут');

    await expect(repository.open(domainId, 'таймаут')).rejects.toThrow();
  });

  it('закрывает открытый инцидент и отдаёт закрытую строку', async () => {
    await repository.open(domainId, 'таймаут');

    const resolved = await repository.resolve(domainId, new Date('2026-10-20T11:00:00Z'));

    expect(resolved?.resolvedAt).toEqual(new Date('2026-10-20T11:00:00Z'));
  });

  it('закрывать нечего — отдаёт пусто, а не падает', async () => {
    expect(await repository.resolve(domainId, new Date())).toBeNull();
  });

  it('после закрытия адрес снова может упасть', async () => {
    // Иначе индекс запретил бы второе падение за всё время.
    await repository.open(domainId, 'раз');
    await repository.resolve(domainId, new Date());

    await expect(repository.open(domainId, 'два')).resolves.toBeDefined();
  });

  it('дописывает ход падения: причина, время и счёт', async () => {
    await repository.open(domainId, 'HTTP 404', new Date('2026-10-20T10:00:00Z'));

    const touched = await repository.touch(
      domainId,
      'DNS не отвечает (EAI_AGAIN)',
      new Date('2026-10-20T10:15:00Z'),
    );

    // Первая причина остаётся: «с чего началось» и «чем кончилось» —
    // разные вопросы, и одна колонка отвечала только на первый.
    expect(touched?.cause).toBe('HTTP 404');
    expect(touched?.lastCause).toBe('DNS не отвечает (EAI_AGAIN)');
    expect(touched?.lastDownAt).toEqual(new Date('2026-10-20T10:15:00Z'));
    expect(touched?.checks).toBe(2);
  });

  it('дописывать нечего — отдаёт пусто, а не падает', async () => {
    expect(await repository.touch(domainId, 'таймаут')).toBeNull();
  });

  it('закрытое падение ход больше не дописывает', async () => {
    // Иначе прогон после подъёма адреса правил бы уже закрытую строку.
    await repository.open(domainId, 'раз');
    await repository.resolve(domainId, new Date('2026-10-20T11:00:00Z'));

    expect(await repository.touch(domainId, 'два')).toBeNull();
  });

  it('счёт подтверждений считает база, а не процесс', async () => {
    // Два прогона, разошедшиеся на миллисекунды, при чтении и записи
    // числа записали бы одно и то же.
    await repository.open(domainId, 'таймаут');
    await Promise.all([
      repository.touch(domainId, 'таймаут'),
      repository.touch(domainId, 'таймаут'),
    ]);

    expect((await repository.openByDomain()).get(domainId)?.checks).toBe(3);
  });

  it('открытый инцидент сразу знает свою последнюю проверку', async () => {
    const incident = await repository.open(domainId, 'HTTP 500', new Date('2026-10-20T10:00:00Z'));

    expect(incident.lastCause).toBe('HTTP 500');
    expect(incident.lastDownAt).toEqual(new Date('2026-10-20T10:00:00Z'));
    expect(incident.checks).toBe(1);
  });

  it('открытые инциденты отдаются картой по адресу', async () => {
    await repository.open(domainId, 'таймаут');

    expect((await repository.openByDomain()).get(domainId)?.cause).toBe('таймаут');
  });

  it('выдача по проекту делит открытый и закрытые', async () => {
    // Закрытие — «сейчас», а не жёсткой датой: `open` ставит начало
    // моментом вставки (третий аргумент задаёт последнюю проверку, а не
    // начало), поэтому окно здесь считается от настоящего «сейчас». С
    // датой закрытия в октябре тест жил ровно до того дня, когда она
    // вышла из тридцатидневного окна, и с 19 ноября падал на пустом
    // `past`, ничего не сообщая о самом разделении.
    await repository.open(domainId, 'раз');
    await repository.resolve(domainId, new Date());
    await repository.open(domainId, 'два');

    const [address] = await repository.forProject(superadmin(), projectId);

    expect(address?.open?.cause).toBe('два');
    expect(address?.past).toHaveLength(1);
  });

  it('счёт падений по проекту включает открытое и назван окном', async () => {
    // Прежде считались только закрытые: адрес лежал прямо сейчас, а
    // четвёртое падение в счёт не попадало.
    await fall(before(2), before(1));
    await fall(before(0, 2), null);

    const [address] = await repository.forProject(superadmin(), projectId, NOW);

    expect(address?.fallsInWindow).toBe(2);
    expect(address?.windowDays).toBe(INCIDENT_WINDOW_DAYS);
  });

  it('падение вне окна в счёт по проекту не идёт', async () => {
    await fall(before(INCIDENT_WINDOW_DAYS + 10), before(INCIDENT_WINDOW_DAYS + 9));

    const [address] = await repository.forProject(superadmin(), projectId, NOW);

    expect(address?.fallsInWindow).toBe(0);
    expect(address?.past).toEqual([]);
  });

  it('предел истории применяется в запросе, а не после выборки', async () => {
    // Иначе таблица, которая не чистится, будет выбираться целиком ради
    // двадцати строк.
    for (let attempt = 0; attempt < PAST_INCIDENTS_LIMIT + 3; attempt += 1) {
      await repository.open(domainId, `отказ ${attempt}`);
      await repository.resolve(domainId, new Date());
    }

    const [address] = await repository.forProject(superadmin(), projectId);

    expect(address?.past).toHaveLength(PAST_INCIDENTS_LIMIT);
  });

  it('без доступа к инфраструктуре проект не раскрывается', async () => {
    // Отсутствие доступа — 404, а не 403: иначе ответ подтвердил бы,
    // что проект существует.
    await expect(repository.forProject(outsider(), projectId)).rejects.toThrow();
  });

  describe('история одного адреса', () => {
    type Query = { windowDays: number; limit: number; offset: number };

    const query = (overrides: Partial<Query> = {}): Query => ({
      windowDays: INCIDENT_WINDOW_DAYS,
      limit: PAST_INCIDENTS_LIMIT,
      offset: 0,
      ...overrides,
    });

    it('доля времени считается пересечением отрезков с окном', async () => {
      // Сутки простоя в окне тридцати суток: 1 − 1/30.
      await fall(before(3), before(2));

      const history = await repository.forAddress(superadmin(), projectId, domainId, query(), NOW);

      expect(history.summary.downSeconds).toBe(DAY_MS / 1000);
      expect(history.summary.uptime).toBeCloseTo(1 - 1 / 30, 6);
      expect(history.summary.falls).toBe(1);
    });

    it('открытое падение считается до «сейчас»', async () => {
      await fall(before(0, 2), null);

      const history = await repository.forAddress(superadmin(), projectId, domainId, query(), NOW);

      expect(history.summary.downSeconds).toBe(2 * 60 * 60);
      expect(history.open).not.toBeNull();
    });

    it('падение, начавшееся до окна, входит только пересечением', async () => {
      // Иначе доля времени за месяц учитывала бы простой прошлого года.
      await fall(before(INCIDENT_WINDOW_DAYS + 10), before(INCIDENT_WINDOW_DAYS - 1));

      const history = await repository.forAddress(superadmin(), projectId, domainId, query(), NOW);

      expect(history.summary.downSeconds).toBe(DAY_MS / 1000);
      expect(history.summary.falls).toBe(1);
    });

    it('падение целиком вне окна не считается вовсе', async () => {
      await fall(before(60), before(59));

      const history = await repository.forAddress(superadmin(), projectId, domainId, query(), NOW);

      expect(history.summary).toEqual({ falls: 0, downSeconds: 0, uptime: 1 });
      expect(history.incidents).toEqual([]);
    });

    it('окно задаётся параметром и называется в ответе', async () => {
      await fall(before(10), before(9));

      const narrow = await repository.forAddress(
        superadmin(),
        projectId,
        domainId,
        query({ windowDays: 7 }),
        NOW,
      );

      expect(narrow.window).toEqual({
        days: 7,
        from: new Date(NOW.getTime() - 7 * DAY_MS).toISOString(),
        to: NOW.toISOString(),
      });
      expect(narrow.summary.falls).toBe(0);
    });

    it('страница отдаётся смещением, у последней следующей нет', async () => {
      await fall(before(5), before(4, 23));
      await fall(before(3), before(2, 23));
      await fall(before(1), before(0, 23));

      const first = await repository.forAddress(
        superadmin(),
        projectId,
        domainId,
        query({ limit: 2 }),
        NOW,
      );
      const second = await repository.forAddress(
        superadmin(),
        projectId,
        domainId,
        query({ limit: 2, offset: 2 }),
        NOW,
      );

      expect(first.incidents).toHaveLength(2);
      expect(first.nextOffset).toBe(2);
      expect(second.incidents).toHaveLength(1);
      expect(second.nextOffset).toBeNull();
      // Число падений — по окну, а не по странице: иначе счёт зависел бы
      // от того, насколько глубоко человек пролистал.
      expect(second.summary.falls).toBe(3);
    });

    it('страница ведёт от свежих к старым, открытое падение в ней тоже', async () => {
      await fall(before(5), before(4), { cause: 'старое' });
      await fall(before(0, 1), null, { cause: 'свежее' });

      const history = await repository.forAddress(superadmin(), projectId, domainId, query(), NOW);

      expect(history.incidents.map((incident) => incident.cause)).toEqual(['свежее', 'старое']);
    });

    it('без выдачи на инфраструктуру адрес не раскрывается', async () => {
      await expect(
        repository.forAddress(outsider(), projectId, domainId, query(), NOW),
      ).rejects.toThrow(SectionNotVisibleError);
    });

    it('адрес чужого проекта не раскрывается так же, как отсутствие выдачи', async () => {
      // Один и тот же 404: иначе ответ сообщил бы, что адрес существует.
      const foreign = await otherProjectAddress();

      await expect(
        repository.forAddress(superadmin(), projectId, foreign, query(), NOW),
      ).rejects.toThrow(SectionNotVisibleError);
    });

    it('уровня «метаданные» достаточно', async () => {
      // Ниже «метаданных» уровня нет: отказ 403 на этой ручке недостижим
      // по построению, и проверять его нечем — доступ либо есть, либо
      // секция не раскрывается.
      await testDb.db.insert(grants).values({
        subjectId: outsiderSubjectId,
        projectId,
        section: Section.Infrastructure,
        level: AccessLevel.Metadata,
        grantedBy: adminUserId,
      });
      await fall(before(1), before(0, 23));

      const history = await repository.forAddress(outsider(), projectId, domainId, query(), NOW);

      expect(history.summary.falls).toBe(1);
    });
  });
});
