import {
  AccessLevel,
  ProjectLifecycle,
  Section,
  TrackerKind,
  type TaskExport,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';

import { SectionNotVisibleError } from '../access/access.errors';
import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { DATABASE } from '../db/db.module';
import type { Database, Transaction } from '../db/db.types';
import {
  projectTasks,
  projects,
  taskExports,
  trackerProjectBindings,
  type TaskExportRow,
} from '../db/schema';
import { taskExportOfRow } from './task-export.projection';
import type { TrackerTaskState } from './tracker';

/**
 * Задача набора вместе с её текущей выгрузкой: что уедет и каким вызовом.
 *
 * Зеркало здесь не для показа, а для **решения**: нет его — задачу надо
 * заводить (`POST`), есть — править (`PUT`) по сохранённому идентификатору.
 *
 * **Этого чтения для решения недостаточно, и оно его не принимает.** Прежде
 * здесь было написано обратное — «между решением и вызовом не должно быть
 * второго чтения, иначе две вкладки выгрузили бы одну задачу дважды», — и
 * это было неправдой ровно наоборот: без замка две вкладки читают
 * «выгрузки нет» **обе**, обе идут `POST`, и в трекере появляются две
 * задачи; `ON CONFLICT` второй идентификатор потом молча выбрасывает
 * (`recordExported` намеренно не переписывает `external_id`). Поэтому
 * решение принимается под замком задачи, своим чтением —
 * {@link TaskExportsRepository.lockTarget}, — а этот список отвечает на
 * другие вопросы: право, порядок набора, сведение повторов и `404` на
 * чужую задачу **до** первого байта наружу.
 */
export interface TaskExportTarget {
  taskId: string;
  /** Формулировка — то единственное, что уходит наружу. */
  title: string;
  export: TaskExport | null;
}

/**
 * Задача, у которой пора спросить состояние: цель прогона опроса.
 *
 * Привязка проекта приходит вместе с задачей, потому что спрашивает прогон
 * **по доске**: фильтра по набору идентификаторов у `GET /tm/tasks` живым
 * токеном не подтверждено (дизайн, 10.4), и ветка «по доске» работает в
 * обоих случаях.
 */
export interface TaskExportPollTarget {
  taskId: string;
  projectId: string;
  tracker: TrackerKind;
  externalId: string;
  externalProjectId: string;
  boardId: string;
  boardColumnId: string;
  /** Когда спрашивали в последний раз; `null` — ни разу. */
  checkedAt: Date | null;
}

/** Что записать об удачной выгрузке: ответ трекера и доска привязки. */
export interface TaskExportSuccess {
  tracker: TrackerKind;
  /** Куда положили. Известна до первого байта — она из привязки проекта. */
  boardId: string;
  state: TrackerTaskState;
}

/** Что записать о неудаче обмена: только код, без тела чужого ответа. */
export interface TaskExportFailure {
  tracker: TrackerKind;
  code: string;
}

/**
 * Что прогон увидел, спросив трекер о задаче.
 *
 * Три законных состояния, и у каждого свой смысл, поэтому один тип, а не
 * три метода: пишется во всех трёх случаях **одна и та же** строка, и
 * разными путями записи «время проверки пишется всегда» пришлось бы
 * сторожить трижды.
 *
 * - `state` есть — трекер рассказал о задаче;
 * - `state` и `code` пусты — обмен состоялся, но задачи в ответе не было
 *   (унесли с доски, удалили у себя);
 * - `code` есть — обмена не было вовсе.
 */
export interface TaskPollResult {
  tracker: TrackerKind;
  /** Что сказал трекер; `null` — о задаче не было ни слова. */
  state: TrackerTaskState | null;
  /** Код неудачи обмена; `null` — обмен состоялся. */
  code: string | null;
}

/**
 * Выгрузки задач и зеркало их состояния в трекере (дизайн, 3.3).
 *
 * Право — **«Роадмап»**, и новой единицы выдачи доступа не появилось: право
 * на выгрузку есть право на задачу (дизайн, 4). Чтение зеркала — уровень
 * чтения, сама выгрузка — записи: наружу уходит содержимое проекта, и
 * уровень «чтение» на это права не даёт.
 *
 * Субъект в подписи каждого метода, и проверка внутри, тем же исполнителем,
 * которым идёт работа (ТЗ 4.1). Единственное исключение названо у
 * {@link listForPoll}: у прогона субъекта нет вовсе.
 */
@Injectable()
export class TaskExportsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly access: AccessService,
  ) {}

  /**
   * Задачи набора в порядке набора вместе с их выгрузками.
   *
   * Порядок — **присланный**, а не порядок таблицы: человек отмечал строки
   * на экране, и итоги, пришедшие в другом порядке, пришлось бы сводить с
   * его выбором на клиенте. Повторы сводятся: иначе одна задача уехала бы
   * дважды — второй раз `PUT`, то есть лишний поход в чужой API, который
   * считает частоту, и лишняя запись журнала о передаче.
   *
   * Неизвестная или чужая задача — `404`, а не молчаливый пропуск: ответ
   * «всё хорошо» на запрос, половина которого не выполнена, человек заметил
   * бы, только пересчитав строки итога.
   */
  async targetsOf(
    subject: RequestSubject,
    projectId: string,
    taskIds: string[],
  ): Promise<TaskExportTarget[]> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write);

    const unique = [...new Set(taskIds)];

    const rows = await this.db
      .select({ id: projectTasks.id, title: projectTasks.title, row: taskExports })
      .from(projectTasks)
      // Соединение по задаче, без вида трекера: ключ выгрузки — пара
      // «задача × трекер», а в перечне одно значение (дизайн, 10.1), то
      // есть больше одной строки на задачу база не допустит. Второй вид
      // трекера обязан переделать выбор здесь же.
      .leftJoin(taskExports, eq(taskExports.taskId, projectTasks.id))
      .where(and(eq(projectTasks.projectId, projectId), inArray(projectTasks.id, unique)));

    const found = new Map(rows.map((row) => [row.id, row]));

    return unique.map((taskId) => {
      const row = found.get(taskId);

      if (!row) {
        throw new SectionNotVisibleError();
      }

      return {
        taskId,
        title: row.title,
        export: row.row === null ? null : taskExportOfRow(row.row),
      };
    });
  }

  /**
   * Запирает задачу и под замком отдаёт решение: заводить или править.
   *
   * **Замок в базе, строкой задачи, до конца транзакции** — тот же приём,
   * что `lockProject` у роадмапа: там под ним считается `max(position) + 1`,
   * здесь — решение «есть ли уже выгрузка». Без него две одновременные
   * выгрузки одной задачи читают «выгрузки нет» обе, обе идут `POST`, и в
   * чужом трекере появляются **две** задачи; вторая при этом теряется
   * начисто — `recordExported` намеренно не переписывает `external_id`, и
   * правит её потом никто.
   *
   * Почему запирается задача, а не выгрузка: строки выгрузки у первой
   * выгрузки ещё нет, а запереть нечего. Задача — её родитель, он есть
   * всегда, и по той же причине роадмап запирает проект, а не версию.
   * Названная цена: правка формулировки той же задачи ждёт конца обмена, то
   * есть до предела ожидания адаптера. Это не досадная мелочь, а верное
   * поведение — пока формулировка уезжает наружу, менять её значит не знать,
   * которую из двух приняли. Сеансовый замок по хешу идентификатора
   * (`pg_advisory_lock`) отвергнут: он молча сводил бы в одну очередь
   * несвязанные задачи при совпадении хеша и ничего не говорил бы о том,
   * жива ли ещё сама задача.
   *
   * `null` означает «задачи больше нет»: её унесли между чтением набора и
   * замком. Отправлять нечего, и вызывающий вправе лишь пропустить её.
   *
   * Исполнитель — **тот же**, которым взят замок: проверка права в другой
   * транзакции видела бы состояние до неё (ТЗ 4.1).
   */
  async lockTarget(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    taskId: string,
  ): Promise<TaskExportTarget | null> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);

    const [row] = await tx
      .select({ id: projectTasks.id, title: projectTasks.title })
      .from(projectTasks)
      .where(and(eq(projectTasks.id, taskId), eq(projectTasks.projectId, projectId)))
      // `no key update`, а не `update`: внешние ключи на задачу (размещение
      // в версии, теги платформ) остаются ставимыми, пока идёт обмен, — они
      // к выгрузке не относятся вовсе. Запирается именно решение о выгрузке.
      .for('no key update');

    if (!row) {
      return null;
    }

    // Чтение зеркала идёт **после** замка и тем же исполнителем: прочитай
    // его раньше — и замок сторожил бы решение, принятое до него.
    const [mirror] = await tx
      .select()
      .from(taskExports)
      .where(eq(taskExports.taskId, taskId))
      .limit(1);

    return {
      taskId,
      title: row.title,
      export: mirror ? taskExportOfRow(mirror) : null,
    };
  }

  /**
   * Пишет удачную выгрузку: заводит зеркало либо правит существующее.
   *
   * Один `ON CONFLICT (task_id, tracker) DO UPDATE` на оба случая, потому
   * что ключ составной и суррогатного `id` у строки нет: два запроса
   * («посмотреть, потом вставить или обновить») разошлись бы между двумя
   * вкладками ровно так, чтобы завести вторую строку.
   *
   * При этом ветка конфликта означает здесь **повторную выгрузку человеком**,
   * и только её: решение «заводить или править» принято под замком задачи
   * ({@link lockTarget}), поэтому две одновременные выгрузки одной задачи до
   * этого места вдвоём не доходят. Прежде доходили — и `external_id`,
   * который правка не переписывает, терялся вместе со второй задачей,
   * заведённой в чужом трекере.
   *
   * Чего правка **не** трогает, и каждое — своё решение:
   *
   * - `external_id` остаётся тем, по которому мы и ходили. Ответ, назвавший
   *   другой, означал бы, что мы правили не ту задачу, и записать его
   *   значило бы потерять ссылку на ту, которую правили;
   * - `exported_at` — это «когда выгрузили», то есть первый раз. Переписав
   *   его, экран сказал бы, что задача уехала только что;
   * - `external_board_id` — «куда положили». Повторная выгрузка задачу не
   *   переносит (адаптер доску и колонку в теле `PUT` не отправляет), и
   *   запись доски привязкой утверждала бы перенос, которого не было;
   * - `checked_at` — «когда **спрашивали** статус». Выгрузка не спрашивает,
   *   а говорит, и время здесь означало бы опрос, которого не было, — та же
   *   ошибка, что аптайм без пропусков наблюдения.
   *
   * `coalesce` у ссылки и колонки: `null` в ответе означает «трекер не
   * сказал», а не «ссылки нет» — формат ссылки живым токеном не проверен
   * (дизайн, 10.4), и молчание затёрло бы ту, которую мы уже знали.
   */
  async recordExported(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    taskId: string,
    input: TaskExportSuccess,
  ): Promise<TaskExportRow> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);

    const [written] = await tx
      .insert(taskExports)
      .values({
        taskId,
        tracker: input.tracker,
        externalId: input.state.externalId,
        externalUrl: input.state.externalUrl,
        externalBoardId: input.boardId,
        externalColumnId: input.state.boardColumnId,
        isCompleted: input.state.isCompleted,
        failureCode: null,
      })
      .onConflictDoUpdate({
        target: [taskExports.taskId, taskExports.tracker],
        set: {
          externalUrl: sql`coalesce(excluded.external_url, ${taskExports.externalUrl})`,
          externalColumnId: sql`coalesce(excluded.external_column_id, ${taskExports.externalColumnId})`,
          // Пишется как сказал ответ на правку: это свежайшее знание о чужом
          // состоянии, и держать зеркало старше только что пришедшего ответа
          // незачем. Закрывать здесь по-прежнему нечего — зеркало ничего не
          // закрывает (дизайн, 5).
          isCompleted: sql`excluded.is_completed`,
          // Удача снимает код прежней неудачи: иначе бирка «Обмен не
          // удался» висела бы над задачей, которая уехала десять минут назад.
          failureCode: null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return written!;
  }

  /**
   * Пишет код неудачи обмена в **существующую** строку выгрузки.
   *
   * Строки не заводит, и это инвариант: строка означает «задача в трекере
   * есть». Завести её на отказе значило бы сказать экрану «задача там лежит,
   * но где — неизвестно», а повторная выгрузка пошла бы `PUT` по
   * идентификатору, которого нет.
   *
   * Зеркало не трогает: оно — то, что мы знали о чужой задаче, а отказ
   * обмена об этом не сообщает ничего. Стереть его значило бы потерять
   * ссылку наружу из-за одного таймаута.
   *
   * `null` в ответе означает «писать было некуда»: первая выгрузка не
   * удалась, и зеркала у задачи так и нет.
   */
  async recordFailure(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    taskId: string,
    failure: TaskExportFailure,
  ): Promise<TaskExportRow | null> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);

    const [written] = await tx
      .update(taskExports)
      .set({ failureCode: failure.code, updatedAt: new Date() })
      .where(
        and(eq(taskExports.taskId, taskId), eq(taskExports.tracker, failure.tracker)),
      )
      .returning();

    return written ?? null;
  }

  /**
   * Пишет исход опроса в строку выгрузки (план, C3).
   *
   * **Без субъекта, и это то же названное исключение, что у
   * {@link listForPoll}**: пишет прогон, у которого субъекта нет вовсе, —
   * ровно как записи проверок статуса. Взамен метод не умеет записать
   * ничего, что было бы содержимым проекта: ни формулировки, ни ссылки,
   * которую вписал человек, — только зеркало чужого состояния.
   *
   * **Время проверки пишется во всех трёх случаях**, включая неудачу обмена
   * (дизайн, 3.3). Без этого «давно не спрашивали» не отличить от «не
   * менялось», а у неудачи цена ещё прямее: порядок обхода идёт по
   * `checked_at asc nulls first`, и задача, об опросе которой не осталось
   * отметки, стояла бы в голове очереди вечно — один мёртвый узел отнял бы
   * наблюдение у всех остальных задач.
   *
   * **Время правки зеркала двигается только при настоящем изменении.** Иначе
   * двух колонок не нужно вовсе: «когда спрашивали» и «когда менялось»
   * слились бы в одну, и экран сказал бы «закрыта в трекере только что» про
   * то, что мы знали третьи сутки. Сравнение идёт в самой базе, а не чтением
   * строки перед записью: второе чтение разошлось бы с записью между двумя
   * тиками.
   *
   * **Строк не заводит** (`UPDATE`, а не `ON CONFLICT`): строка означает
   * «задача в трекере есть», и завести её опросом значило бы сказать это о
   * задаче, которую никто не выгружал. `null` — строки не нашлось: её унесли,
   * пока шёл тик.
   *
   * Удачный опрос **снимает** код прежней неудачи, и у этого названная цена:
   * код один на оба обмена — выгрузку и опрос, — поэтому неудавшаяся выгрузка,
   * за которой пошёл удачный опрос, перестаёт быть видна у задачи. Ответ на
   * «уехала ли формулировка» остаётся в журнале, который о передаче
   * единственный неизменяемый след. Альтернатива — не снимать код вовсе —
   * отвергнута дороже: бирка «Обмен не удался» висела бы над здоровой задачей
   * до следующей выгрузки, то есть сообщала бы о сетевой заминке пятидневной
   * давности как о текущей беде.
   */
  async recordPolled(
    tx: Transaction,
    taskId: string,
    result: TaskPollResult,
  ): Promise<TaskExportRow | null> {
    const [written] = await tx
      .update(taskExports)
      .set(pollPatchOf(result))
      .where(and(eq(taskExports.taskId, taskId), eq(taskExports.tracker, result.tracker)))
      .returning();

    return written ?? null;
  }

  /**
   * Уносит зеркала всех задач по этому виду трекера (дизайн, 3.3).
   *
   * **Без субъекта**, по той же причине, что {@link listForPoll}: снятие
   * подключения — действие над установкой, не над проектом, и выдачи на все
   * проекты разом суперадмину не выписать. Право стоит выше, у ручки
   * подключения под `SuperadminGuard`.
   *
   * Почему это обязательный шаг, а не уборка для порядка. Строка выгрузки
   * означает «задача в трекере есть, и зовётся она так-то». Переживи она
   * смену токена на **другое** пространство — и повторная выгрузка пошла бы
   * `PUT /tm/tasks/{id}` по идентификатору, который там принадлежит чужой
   * задаче, то есть переписала бы чужую формулировку молча. Задачи при этом
   * не трогаются вовсе: трекер не владелец реестра, и снятие настройки
   * установки не вправе стирать содержимое проектов.
   *
   * Названная цена: задачи в трекере остаются жить, а ответ на «что из
   * нашего там лежит» уходит из базы. Удалять их за человека мы не вправе
   * (дизайн, 10.5), поэтому предупреждение на экране говорит это словами
   * **до** нажатия, а следом остаются записи журнала о каждой выгрузке.
   */
  async removeForTracker(tx: Transaction, tracker: TrackerKind): Promise<void> {
    await tx.delete(taskExports).where(eq(taskExports.tracker, tracker));
  }

  /**
   * Задачи, у которых пора спросить состояние (дизайн, 8).
   *
   * **Без субъекта, и это названное исключение из правила ТЗ 4.1**: обход
   * делает прогон, а не человек, — у него субъекта нет вовсе, как у прогона
   * проверок статуса. Выдачу ему не выписать: право выдаётся на проект, а
   * обход идёт по всем. Взамен метод не отдаёт ничего, что было бы
   * содержимым проекта: ни формулировок, ни ссылок — только идентификаторы,
   * по которым задаётся вопрос.
   *
   * Что из обхода исключено, и почему каждое:
   *
   * - закрытые в трекере: закрытая задача не меняется, и спрашивать о ней
   *   каждые пять минут — платить трафиком за известное;
   * - архивные проекты — то же правило, что у прогона проверок: архив
   *   никто не чинит;
   * - проекты без привязки: спрашивают **по доске**, и без привязки
   *   спрашивать нечем.
   *
   * Порядок — «кого дольше не спрашивали», и «ни разу» впереди всех: это
   * самое старое знание, какое бывает, а отложенное в конец при пределе
   * набора не дождалось бы своей очереди никогда.
   */
  async listForPoll(limit: number): Promise<TaskExportPollTarget[]> {
    return this.db
      .select({
        taskId: taskExports.taskId,
        projectId: projectTasks.projectId,
        tracker: taskExports.tracker,
        externalId: taskExports.externalId,
        externalProjectId: trackerProjectBindings.externalProjectId,
        boardId: trackerProjectBindings.boardId,
        boardColumnId: trackerProjectBindings.boardColumnId,
        checkedAt: taskExports.checkedAt,
      })
      .from(taskExports)
      .innerJoin(projectTasks, eq(projectTasks.id, taskExports.taskId))
      .innerJoin(projects, eq(projects.id, projectTasks.projectId))
      .innerJoin(
        trackerProjectBindings,
        eq(trackerProjectBindings.projectId, projectTasks.projectId),
      )
      .where(
        and(
          eq(taskExports.isCompleted, false),
          ne(projects.lifecycle, ProjectLifecycle.Archived),
        ),
      )
      .orderBy(
        // `nulls first` именно так и читается: ни разу не спрошенные сверху.
        sql`${taskExports.checkedAt} asc nulls first`,
        asc(taskExports.exportedAt),
      )
      .limit(limit);
  }
}

/**
 * Во что превращается исход опроса: набор колонок одной строки.
 *
 * Функцией вне класса, потому что никакой базы ей не нужно: это разбор
 * трёх случаев, и проверять его правила удобнее по той строке, которая
 * из них вышла.
 *
 * Время — одно на всю запись (`now`), а не `now()` в каждом выражении:
 * иначе «спрашивали» и «правили» в одной и той же записи разошлись бы на
 * доли секунды, и сравнить их было бы нельзя.
 */
function pollPatchOf(result: TaskPollResult): PgUpdateSetSource<typeof taskExports> {
  const now = new Date();
  // Внутри `sql` время идёт строкой с приведением типа: драйвер в сырое
  // выражение `Date` не отдаёт вовсе, а параметр без типа PostgreSQL
  // отказался бы разбирать рядом с `case`.
  const stamp = sql`${now.toISOString()}::timestamptz`;

  if (result.code !== null) {
    return {
      failureCode: result.code,
      checkedAt: now,
      // Повторная та же неудача правкой не считается: пятый подряд таймаут
      // не новость о зеркале, и двинув время, экран показал бы свежесть
      // знания, которого нет.
      updatedAt: sql`case when ${taskExports.failureCode} is distinct from ${result.code}::text
        then ${stamp} else ${taskExports.updatedAt} end`,
    };
  }

  if (result.state === null) {
    // Обмен состоялся, но о задаче в ответе не было ни слова: её унесли с
    // доски или удалили в трекере. Это не «закрыта» и не «открыта», и
    // выдумывать за молчание нельзя — записывается только сам факт
    // вопроса. Своего кода отказа у этого случая нет намеренно: отказа не
    // было, канал жив, и назвать его неудачей обмена значило бы соврать о
    // канале (названная граница: расхождение «зеркало старое, а спрашивали
    // только что» видно по времени правки, которое стоит на месте).
    return { checkedAt: now };
  }

  const { isCompleted, externalUrl, boardColumnId } = result.state;

  return {
    isCompleted,
    // `coalesce` у ссылки и колонки — то же правило, что у записи выгрузки:
    // `null` означает «трекер не сказал», и молчание не стирает известное.
    externalUrl: sql`coalesce(${externalUrl}::text, ${taskExports.externalUrl})`,
    externalColumnId: sql`coalesce(${boardColumnId}::text, ${taskExports.externalColumnId})`,
    // Удачный обмен снимает код прежней неудачи (цена названа у
    // `recordPolled`).
    failureCode: null,
    checkedAt: now,
    // Сравнение построчное: двигать время правки от самого факта опроса
    // значило бы слить две колонки в одну.
    updatedAt: sql`case when (${taskExports.isCompleted}, ${taskExports.externalUrl}, ${taskExports.externalColumnId}, ${taskExports.failureCode})
      is distinct from (
        ${isCompleted}::boolean,
        coalesce(${externalUrl}::text, ${taskExports.externalUrl}),
        coalesce(${boardColumnId}::text, ${taskExports.externalColumnId}),
        null::text
      ) then ${stamp} else ${taskExports.updatedAt} end`,
  };
}
