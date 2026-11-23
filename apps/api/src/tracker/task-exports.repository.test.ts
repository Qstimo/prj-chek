import {
  AccessLevel,
  ProjectLifecycle,
  Section,
  SubjectKind,
  TRACKER_REJECTED,
  TRACKER_UNAVAILABLE,
  TaskOrigin,
  TrackerKind,
} from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';
import { InsufficientLevelError, SectionNotVisibleError } from '../access/access.errors';
import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import {
  grants,
  projectTasks,
  projects,
  subjects,
  taskExports,
  trackerProjectBindings,
  users,
} from '../db/schema';
import type { TrackerTaskState } from './tracker';
import { TaskExportsRepository } from './task-exports.repository';

/** Что сказал трекер о заведённой задаче: один ответ на все проверки. */
const STATE: TrackerTaskState = {
  externalId: '4096',
  externalUrl: 'https://app.weeek.net/ws/4242/task/4096',
  boardId: '11',
  boardColumnId: '31',
  isCompleted: false,
};

describe('репозиторий выгрузок задач', () => {
  let testDb: TestDatabase;
  let repository: TaskExportsRepository;
  let projectId: string;
  let otherProjectId: string;
  let subjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new TaskExportsRepository(testDb.db, new AccessService(testDb.db));
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    const [admin] = await testDb.db
      .insert(users)
      .values({
        subjectId: adminSubject!.id,
        email: 'admin@cairn.local',
        passwordHash: 'хэш',
        isSuperadmin: true,
      })
      .returning();
    adminUserId = admin!.id;

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    subjectId = subject!.id;
    await testDb.db
      .insert(users)
      .values({ subjectId, email: 'user@cairn.local', passwordHash: 'хэш' });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;
    const [other] = await testDb.db
      .insert(projects)
      .values({ slug: 'chuzhoj', name: 'Чужой' })
      .returning();
    otherProjectId = other!.id;
  });

  const member = (): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'user@cairn.local',
    isSuperadmin: false,
    isRevoked: false,
  });

  /** Выдача именно на «Роадмап»: право на выгрузку — право на задачу. */
  async function grant(level: AccessLevel, section: Section = Section.Roadmap): Promise<void> {
    await testDb.db.insert(grants).values({
      subjectId,
      projectId,
      section,
      level,
      grantedBy: adminUserId,
    });
  }

  async function seedTask(title: string, project = projectId): Promise<string> {
    const [task] = await testDb.db
      .insert(projectTasks)
      .values({ projectId: project, title, origin: TaskOrigin.Manual })
      .returning();

    return task!.id;
  }

  /** Привязка доски: без неё прогону нечем спрашивать трекер. */
  async function bind(project = projectId): Promise<void> {
    await testDb.db.insert(trackerProjectBindings).values({
      projectId: project,
      tracker: TrackerKind.Weeek,
      externalProjectId: '7',
      boardId: '11',
      boardColumnId: '31',
      updatedBySubjectId: subjectId,
    });
  }

  /** Строка выгрузки прямо в базе: чтение не зависит от пути записи. */
  async function seedExport(
    taskId: string,
    overrides: Partial<{
      externalId: string;
      externalUrl: string | null;
      externalColumnId: string | null;
      isCompleted: boolean;
      checkedAt: Date | null;
      failureCode: string | null;
    }> = {},
  ): Promise<void> {
    await testDb.db.insert(taskExports).values({
      taskId,
      tracker: TrackerKind.Weeek,
      externalId: '4096',
      externalBoardId: '11',
      externalColumnId: '31',
      ...overrides,
    });
  }

  /** Строка выгрузки как есть: проверки пишут в базу и читают оттуда же. */
  async function exportRow(taskId: string) {
    const [row] = await testDb.db
      .select()
      .from(taskExports)
      .where(eq(taskExports.taskId, taskId));

    return row;
  }

  describe('цели выгрузки', () => {
    it('без выдачи не раскрывает даже существования задачи', async () => {
      const taskId = await seedTask('Оплата');

      await expect(
        repository.targetsOf(member(), projectId, [taskId]),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });

    it('выдача на «Инфо» выгрузки не открывает', async () => {
      // Сторож решения о правах: право на задачу и её выгрузку — право на
      // «Роадмап», и новой единицы выдачи не появилось (дизайн, 4).
      await grant(AccessLevel.Write, Section.Info);
      const taskId = await seedTask('Оплата');

      await expect(
        repository.targetsOf(member(), projectId, [taskId]),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });

    it('чтения мало: выгрузка уносит содержимое проекта наружу', async () => {
      await grant(AccessLevel.Read);
      const taskId = await seedTask('Оплата');

      await expect(
        repository.targetsOf(member(), projectId, [taskId]),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });

    it('отдаёт формулировки в порядке присланного набора', async () => {
      // Порядок — присланный, а не порядок таблицы: человек отмечал строки
      // на экране, и выгрузка, идущая в своём порядке, отвечала бы итогами
      // не в том порядке, в котором он их читает.
      await grant(AccessLevel.Write);
      const first = await seedTask('Первая');
      const second = await seedTask('Вторая');

      const targets = await repository.targetsOf(member(), projectId, [second, first]);

      expect(targets.map((target) => target.title)).toEqual(['Вторая', 'Первая']);
    });

    it('повторы в наборе сводятся: один проход — один поход наружу', async () => {
      // Иначе задача уехала бы дважды: второй раз `PUT`, то есть лишний
      // поход в чужой API, который считает частоту, и лишняя запись
      // журнала о передаче.
      await grant(AccessLevel.Write);
      const taskId = await seedTask('Оплата');

      const targets = await repository.targetsOf(member(), projectId, [taskId, taskId]);

      expect(targets).toHaveLength(1);
    });

    it('чужая задача в наборе — 404, а не молчаливый пропуск', async () => {
      // Пропустив её, ручка ответила бы «всё хорошо» на запрос, половина
      // которого не выполнена, — и человек узнал бы об этом, только
      // пересчитав строки итога.
      await grant(AccessLevel.Write);
      const alien = await seedTask('Чужая', otherProjectId);

      await expect(
        repository.targetsOf(member(), projectId, [alien]),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });

    it('невыгруженная задача приходит с пустым зеркалом, выгруженная — со своим', async () => {
      // По этому полю служба и решает: нет зеркала — `POST`, есть — `PUT`.
      await grant(AccessLevel.Write);
      const fresh = await seedTask('Новая');
      const exported = await seedTask('Уехавшая');
      await seedExport(exported, { externalId: '777' });

      const targets = await repository.targetsOf(member(), projectId, [fresh, exported]);

      expect(targets[0]?.export).toBeNull();
      expect(targets[1]?.export?.externalId).toBe('777');
    });
  });

  describe('запись результата', () => {
    it('заводит строку выгрузки с внешним идентификатором, ссылкой и доской', async () => {
      await grant(AccessLevel.Write);
      const taskId = await seedTask('Оплата');

      const written = await testDb.db.transaction((tx) =>
        repository.recordExported(member(), tx, projectId, taskId, {
          tracker: TrackerKind.Weeek,
          boardId: '11',
          state: STATE,
        }),
      );

      expect(written).toMatchObject({
        externalId: '4096',
        externalUrl: 'https://app.weeek.net/ws/4242/task/4096',
        externalBoardId: '11',
        externalColumnId: '31',
        isCompleted: false,
        failureCode: null,
      });
    });

    it('опроса не было: время проверки остаётся пустым', async () => {
      // Подставить сюда время выгрузки значило бы сказать «статус
      // спрашивали», хотя мы сказали, а не спросили, — та же ошибка, что
      // аптайм без пропусков наблюдения.
      await grant(AccessLevel.Write);
      const taskId = await seedTask('Оплата');

      await testDb.db.transaction((tx) =>
        repository.recordExported(member(), tx, projectId, taskId, {
          tracker: TrackerKind.Weeek,
          boardId: '11',
          state: STATE,
        }),
      );

      expect((await exportRow(taskId))?.checkedAt).toBeNull();
    });

    it('повторная выгрузка правит строку, а не заводит вторую', async () => {
      await grant(AccessLevel.Write);
      const taskId = await seedTask('Оплата');
      await seedExport(taskId, { externalId: '4096' });

      await testDb.db.transaction((tx) =>
        repository.recordExported(member(), tx, projectId, taskId, {
          tracker: TrackerKind.Weeek,
          boardId: '11',
          state: { ...STATE, boardColumnId: '32' },
        }),
      );

      const rows = await testDb.db
        .select()
        .from(taskExports)
        .where(eq(taskExports.taskId, taskId));

      expect(rows).toHaveLength(1);
      expect(rows[0]?.externalColumnId).toBe('32');
    });

    it('повторная выгрузка не меняет внешний идентификатор и «когда выгрузили»', async () => {
      // Решение владельца: повторная выгрузка **правит** задачу в трекере.
      // Значит ссылка на неё та же, и «когда выгрузили» — это первый раз:
      // переписав его, экран сказал бы, что задача уехала только что.
      await grant(AccessLevel.Write);
      const taskId = await seedTask('Оплата');
      await seedExport(taskId, { externalId: '4096' });
      const before = await exportRow(taskId);

      await testDb.db.transaction((tx) =>
        repository.recordExported(member(), tx, projectId, taskId, {
          tracker: TrackerKind.Weeek,
          boardId: '99',
          state: { ...STATE, externalId: '4096' },
        }),
      );

      const after = await exportRow(taskId);
      expect(after?.externalId).toBe('4096');
      expect(after?.exportedAt).toEqual(before?.exportedAt);
      // Доска тоже не переписывается: повторная выгрузка задачу не
      // переносит — адаптер доску и колонку в теле `PUT` не отправляет, —
      // и запись доски привязкой утверждала бы перенос, которого не было.
      expect(after?.externalBoardId).toBe('11');
    });

    it('молчание трекера о ссылке и колонке не стирает известное', async () => {
      // `null` в ответе означает «трекер не сказал», а не «ссылки нет»:
      // формат ссылки живым токеном не проверен, и ответ без неё затёр бы
      // ту, которую мы уже знали.
      await grant(AccessLevel.Write);
      const taskId = await seedTask('Оплата');
      await seedExport(taskId, {
        externalUrl: 'https://app.weeek.net/ws/4242/task/4096',
        externalColumnId: '31',
      });

      await testDb.db.transaction((tx) =>
        repository.recordExported(member(), tx, projectId, taskId, {
          tracker: TrackerKind.Weeek,
          boardId: '11',
          state: { ...STATE, externalUrl: null, boardColumnId: null },
        }),
      );

      expect(await exportRow(taskId)).toMatchObject({
        externalUrl: 'https://app.weeek.net/ws/4242/task/4096',
        externalColumnId: '31',
      });
    });

    it('удачная выгрузка снимает код прежней неудачи', async () => {
      // Иначе бирка «Обмен не удался» висела бы над задачей, которая уехала
      // десять минут назад.
      await grant(AccessLevel.Write);
      const taskId = await seedTask('Оплата');
      await seedExport(taskId, { failureCode: TRACKER_UNAVAILABLE });

      await testDb.db.transaction((tx) =>
        repository.recordExported(member(), tx, projectId, taskId, {
          tracker: TrackerKind.Weeek,
          boardId: '11',
          state: STATE,
        }),
      );

      expect((await exportRow(taskId))?.failureCode).toBeNull();
    });
  });

  describe('запись отказа', () => {
    it('первая неудача строки выгрузки не заводит вовсе', async () => {
      // Строка означает «задача в трекере есть». Завести её на отказе
      // значило бы сказать экрану «задача там лежит, но где — неизвестно»,
      // и повторная выгрузка пошла бы `PUT` по идентификатору, которого
      // нет.
      await grant(AccessLevel.Write);
      const taskId = await seedTask('Оплата');

      const written = await testDb.db.transaction((tx) =>
        repository.recordFailure(member(), tx, projectId, taskId, {
          tracker: TrackerKind.Weeek,
          code: TRACKER_REJECTED,
        }),
      );

      expect(written).toBeNull();
      expect(await exportRow(taskId)).toBeUndefined();
    });

    it('неудача повторной выгрузки пишет код и не трогает зеркало', async () => {
      // Зеркало — то, что мы знали о чужой задаче; отказ обмена об этом
      // ничего не сообщает, и стереть его значило бы потерять ссылку
      // наружу из-за одного таймаута.
      await grant(AccessLevel.Write);
      const taskId = await seedTask('Оплата');
      await seedExport(taskId, { externalId: '777', isCompleted: true });

      const written = await testDb.db.transaction((tx) =>
        repository.recordFailure(member(), tx, projectId, taskId, {
          tracker: TrackerKind.Weeek,
          code: TRACKER_UNAVAILABLE,
        }),
      );

      expect(written).toMatchObject({
        externalId: '777',
        isCompleted: true,
        failureCode: TRACKER_UNAVAILABLE,
      });
    });
  });

  describe('запись опроса', () => {
    it('пишет зеркало и время проверки', async () => {
      // Субъекта в подписи нет вовсе: пишет прогон, а не человек. Выдача
      // здесь не выдаётся ни на что — отсюда и отсутствие `grant` в тесте.
      const taskId = await seedTask('Оплата');
      await seedExport(taskId, { isCompleted: false, externalColumnId: '31' });

      const written = await testDb.db.transaction((tx) =>
        repository.recordPolled(tx, taskId, {
          tracker: TrackerKind.Weeek,
          state: { ...STATE, isCompleted: true, boardColumnId: '33' },
          code: null,
        }),
      );

      expect(written).toMatchObject({ isCompleted: true, externalColumnId: '33' });
      expect(written?.checkedAt).not.toBeNull();
    });

    it('время проверки пишется и когда ничего не изменилось', async () => {
      // Инвариант дизайна 3.3: иначе «давно не спрашивали» не отличить от
      // «не менялось» — та же ошибка, что аптайм без пропусков наблюдения.
      const taskId = await seedTask('Оплата');
      await seedExport(taskId, {
        isCompleted: false,
        externalColumnId: '31',
        externalUrl: STATE.externalUrl,
      });
      const before = await exportRow(taskId);

      const written = await testDb.db.transaction((tx) =>
        repository.recordPolled(tx, taskId, {
          tracker: TrackerKind.Weeek,
          state: { ...STATE, isCompleted: false, boardColumnId: '31' },
          code: null,
        }),
      );

      expect(written?.checkedAt).not.toBeNull();
      // А время правки зеркала стоит на месте: двинув его, экран сказал бы
      // «закрыта в трекере только что» про то, что мы знали третьи сутки, и
      // две колонки стали бы одной.
      expect(written?.updatedAt).toEqual(before?.updatedAt);
    });

    it('изменившееся зеркало двигает и время правки', async () => {
      const taskId = await seedTask('Оплата');
      await seedExport(taskId, { isCompleted: false });
      const before = await exportRow(taskId);

      const written = await testDb.db.transaction((tx) =>
        repository.recordPolled(tx, taskId, {
          tracker: TrackerKind.Weeek,
          state: { ...STATE, isCompleted: true },
          code: null,
        }),
      );

      expect(written!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
    });

    it('неудача обмена не стирает зеркало, а пишет код', async () => {
      // Зеркало — то, что мы знали о чужой задаче, и отказ опроса об этом
      // не сообщает ничего: стереть его значило бы потерять ссылку наружу
      // из-за одного таймаута.
      const taskId = await seedTask('Оплата');
      await seedExport(taskId, { externalId: '777', isCompleted: true });

      const written = await testDb.db.transaction((tx) =>
        repository.recordPolled(tx, taskId, {
          tracker: TrackerKind.Weeek,
          state: null,
          code: TRACKER_UNAVAILABLE,
        }),
      );

      expect(written).toMatchObject({
        externalId: '777',
        isCompleted: true,
        failureCode: TRACKER_UNAVAILABLE,
      });
      // Спрашивали — значит спрашивали: без этой отметки один мёртвый узел
      // стоял бы в голове очереди вечно и до остальных задач прогон не
      // дошёл бы ни разу.
      expect(written?.checkedAt).not.toBeNull();
    });

    it('удачный опрос снимает код прежней неудачи', async () => {
      const taskId = await seedTask('Оплата');
      await seedExport(taskId, { failureCode: TRACKER_UNAVAILABLE });

      const written = await testDb.db.transaction((tx) =>
        repository.recordPolled(tx, taskId, {
          tracker: TrackerKind.Weeek,
          state: STATE,
          code: null,
        }),
      );

      expect(written?.failureCode).toBeNull();
    });

    it('молчание ответа о ссылке и колонке не стирает известное', async () => {
      const taskId = await seedTask('Оплата');
      await seedExport(taskId, {
        externalUrl: 'https://app.weeek.net/ws/4242/task/4096',
        externalColumnId: '31',
      });

      const written = await testDb.db.transaction((tx) =>
        repository.recordPolled(tx, taskId, {
          tracker: TrackerKind.Weeek,
          state: { ...STATE, externalUrl: null, boardColumnId: null },
          code: null,
        }),
      );

      expect(written).toMatchObject({
        externalUrl: 'https://app.weeek.net/ws/4242/task/4096',
        externalColumnId: '31',
      });
    });

    it('ответ, не назвавший задачу, двигает только время проверки', async () => {
      // Задачу унесли с доски или удалили в трекере. Молчание ответа не
      // означает ни «закрыта», ни «открыта», и выдумывать за него нельзя:
      // спрашивали — записано, зеркало — как было.
      const taskId = await seedTask('Оплата');
      await seedExport(taskId, { isCompleted: true, failureCode: TRACKER_REJECTED });
      const before = await exportRow(taskId);

      const written = await testDb.db.transaction((tx) =>
        repository.recordPolled(tx, taskId, {
          tracker: TrackerKind.Weeek,
          state: null,
          code: null,
        }),
      );

      expect(written).toMatchObject({ isCompleted: true, failureCode: TRACKER_REJECTED });
      expect(written?.checkedAt).not.toBeNull();
      expect(written?.updatedAt).toEqual(before?.updatedAt);
    });

    it('строк не заводит: опрос спрашивает о выгруженном', async () => {
      // Строка означает «задача в трекере есть», и завести её опросом
      // значило бы сказать это о задаче, которую никто не выгружал.
      const taskId = await seedTask('Оплата');

      const written = await testDb.db.transaction((tx) =>
        repository.recordPolled(tx, taskId, {
          tracker: TrackerKind.Weeek,
          state: STATE,
          code: null,
        }),
      );

      expect(written).toBeNull();
      expect(await exportRow(taskId)).toBeUndefined();
    });
  });

  describe('цели прогона опроса', () => {
    it('отдаёт выгруженные и не закрытые задачи вместе с привязкой', async () => {
      await bind();
      const taskId = await seedTask('Оплата');
      await seedExport(taskId);

      const targets = await repository.listForPoll(10);

      expect(targets).toMatchObject([
        {
          taskId,
          projectId,
          tracker: TrackerKind.Weeek,
          externalId: '4096',
          externalProjectId: '7',
          boardId: '11',
          boardColumnId: '31',
        },
      ]);
    });

    it('закрытая в трекере задача больше не опрашивается', async () => {
      // Закрытая задача не меняется, и спрашивать о ней каждые пять минут
      // — платить трафиком за известное (дизайн, 8).
      await bind();
      const taskId = await seedTask('Оплата');
      await seedExport(taskId, { isCompleted: true });

      expect(await repository.listForPoll(10)).toEqual([]);
    });

    it('архивный проект из обхода исключён', async () => {
      // То же правило, что у прогона проверок статуса: архив никто не
      // чинит, и спрашивать о нём значит платить за мёртвое.
      await bind();
      const taskId = await seedTask('Оплата');
      await seedExport(taskId);
      await testDb.db
        .update(projects)
        .set({ lifecycle: ProjectLifecycle.Archived })
        .where(eq(projects.id, projectId));

      expect(await repository.listForPoll(10)).toEqual([]);
    });

    it('проект без привязки в обход не попадает', async () => {
      // Опрос идёт по доске (у `GET /tm/tasks` фильтра по набору id живым
      // токеном не подтверждено), и без привязки спрашивать нечем.
      const taskId = await seedTask('Оплата');
      await seedExport(taskId);

      expect(await repository.listForPoll(10)).toEqual([]);
    });

    it('сначала те, кого дольше не спрашивали; ни разу — впереди всех', async () => {
      // «Ни разу не спрашивали» — самое старое знание, какое бывает, и
      // отложив его в конец, прогон с пределом никогда бы до него не дошёл.
      await bind();
      const asked = await seedTask('Спрошенная');
      const never = await seedTask('Неспрошенная');
      await seedExport(asked, { checkedAt: new Date('2026-11-23T10:00:00.000Z') });
      await seedExport(never, { checkedAt: null });

      const targets = await repository.listForPoll(10);

      expect(targets.map((target) => target.taskId)).toEqual([never, asked]);
    });

    it('предел набора соблюдается: тик делает ограниченную работу', async () => {
      await bind();
      const first = await seedTask('Первая');
      const second = await seedTask('Вторая');
      await seedExport(first, { checkedAt: null });
      await seedExport(second, { checkedAt: new Date('2026-11-23T10:00:00.000Z') });

      expect(await repository.listForPoll(1)).toHaveLength(1);
    });
  });
});
