import {
  TRACKER_UNAVAILABLE,
  TRACKER_LINK_INVALID,
  TRACKER_LINK_REQUIRED,
  weeekTaskLinkOf,
  isWeeekLink,
  type TaskExport,
  TaskExportOutcome,
  type AuditSubjectKind,
  type TaskExportRequest,
  type TaskExportResult,
  type TrackerBinding,
} from '@cairn/shared';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Inject,
  Injectable,
} from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { taskExportOfRow } from './task-export.projection';
import { TaskExportsRepository, type TaskExportTarget } from './task-exports.repository';
import { TrackerBindingsRepository } from './tracker-bindings.repository';
import {
  TRACKER_SOURCE,
  TrackerFailure,
  type Tracker,
  type TrackerSource,
  type TrackerTarget,
  type TrackerTaskState,
} from './tracker';
import { TrackerBindingMissingError, TrackerNotConfiguredError } from './tracker.errors';
import { TRACKER_TIMEOUT_SECONDS } from './tracker.settings';

/**
 * Токен соединения, на котором держится замок задачи.
 *
 * Отдельно от рабочего подключения по той же причине, что у прогонов
 * проверок, расшифровок и опроса трекера: замок занимает соединение на всё
 * время обмена, а записи этого же обмена идут **своими** транзакциями — их
 * у выгрузки две, и обе обязаны коммититься, пока замок ещё держится
 * (запись в журнал — до первого байта наружу, запись выгрузки — после
 * ответа). Возьми замок рабочее подключение, и в тестах, где пул состоит из
 * единственного соединения, выгрузка заперла бы сама себя. В развёртывании
 * это тот же пул, что и `DATABASE`.
 */
export const TASK_EXPORT_LOCK_DB = Symbol('TASK_EXPORT_LOCK_DB');

/**
 * Сколько времени набор вправе занять целиком, в миллисекундах.
 *
 * Откуда число: умолчание `proxy_read_timeout` у nginx — 60 секунд, и за
 * реверс-прокси клиент получит `504` ровно тогда, когда сервер ещё
 * выгружает. Пятьдесят оставляет десять на наш собственный разбор запроса,
 * чтение набора и запись ответа.
 *
 * Предел нужен потому, что набор идёт **по одной задаче** (чужой API считает
 * частоту), а у каждого обмена свой предел ожидания: пятьдесят задач по
 * двадцать секунд — это шестнадцать минут в одной ручке. Надеяться, что
 * трекер отвечает быстро, нельзя: предел обязан быть выражен в коде, иначе
 * его нет.
 */
export const EXPORT_BATCH_BUDGET_MS = 50_000;

/**
 * До какого мгновения набора вправе **начаться** новый обмен.
 *
 * Выведено из предела, а не задано рядом с ним: начни обмен позже этого
 * мгновения, и худший его исход (полное ожидание адаптера) вынес бы ответ за
 * {@link EXPORT_BATCH_BUDGET_MS}, то есть предел не выполнялся бы ровно в том
 * случае, для которого он и поставлен — когда трекер отвечает медленно.
 * Поэтому число одно, а не два: два разошлись бы на первой же правке.
 */
const EXPORT_BATCH_START_BEFORE_MS = EXPORT_BATCH_BUDGET_MS - TRACKER_TIMEOUT_SECONDS * 1000;

/**
 * Выгрузка задач проекта во внешний трекер (план, C2).
 *
 * **Порядок внутри одной задачи не переставляется**, и каждый шаг отвечает
 * на свой вопрос:
 *
 * 1. право записи на «Роадмап» и привязка доски — иначе наружу не уходит ни
 *    один байт;
 * 2. **замок задачи в базе** — под ним принимается решение «заводить или
 *    править», и держится он до конца обмена: иначе две одновременные
 *    выгрузки одной задачи завели бы в трекере две;
 * 3. **запись в журнал своей короткой транзакцией — до первого байта**;
 * 4. `createTask` либо `updateTask`: есть зеркало — правим, нет — заводим;
 * 5. запись выгрузки (внешний id, ссылка, доска и колонка);
 * 6. неудача — код в строке выгрузки, задача остаётся как была.
 *
 * Второй шаг — названное отступление от правила «журнал в одной транзакции с
 * действием», то же, что у разбивки текста и расшифровки записи: действие
 * здесь не изменение в базе, а исходящая передача содержимого проекта. Нет
 * записи — нет и передачи; обратный порядок терял бы ровно оборвавшиеся
 * вызовы, то есть те, о которых важнее всего знать.
 *
 * **Порт берётся один раз на вызов.** Смена настройки посреди набора
 * оставила бы в журнале один узел, а формулировки уехали бы на другой — то
 * есть журнал начал бы врать о передаче, о которой он единственный след.
 */
@Injectable()
export class TaskExportsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(TASK_EXPORT_LOCK_DB) private readonly lockDb: Database,
    private readonly exports: TaskExportsRepository,
    private readonly bindings: TrackerBindingsRepository,
    private readonly audit: AuditService,
    @Inject(TRACKER_SOURCE) private readonly trackers: TrackerSource,
  ) {}

  /**
   * Выгружает набор задач и отвечает итогом на каждую.
   *
   * Одна ручка на одну и на много задач: набор из одного элемента и есть
   * одна задача. Вторая ручка «выгрузить одну» повторяла бы порядок выше, а
   * повторённый порядок расходится.
   *
   * Идут задачи **по очереди**, а не разом: чужой API считает частоту
   * запросов, и пачка параллельных вызовов получила бы `429` на половине
   * набора — то есть обменяла бы скорость на неизвестный исход.
   *
   * **Первый отказ обмена останавливает набор**, и это решение, а не
   * упрощение. Оба кода обмена описывают канал, а не строку — «узел не
   * ответил» и «узел не принял», — а отличить «отказ по этой задаче» от
   * «отказ по всем» нечем: тела чужого ответа мы не читаем принципиально
   * (в нём бывает и сам токен). Продолжив, выгрузка сделала бы ещё сорок
   * девять заведомо пустых походов в API, который считает частоту, и
   * записала бы сорок девять записей журнала о передаче, которой не было, —
   * в неизменяемый журнал, который о передаче единственный след. Цена
   * названа: задача, которую трекер не принимает сама по себе (скажем,
   * слишком длинная формулировка), держит очередь, пока человек не снимет с
   * неё отметку; он видит её биркой «Обмен не удался» с кодом.
   *
   * Уже уехавшие задачи при остановке **остаются выгруженными**: откат унёс
   * бы зеркало задачи, которая в чужом трекере уже лежит, и повторная
   * выгрузка завела бы там вторую.
   *
   * **Набор ограничен и по времени** ({@link EXPORT_BATCH_BUDGET_MS}): задача,
   * до которой очередь дошла после исчерпания предела, получает исход
   * `skipped` — тот же, что после остановки на отказе, — и ответ приходит
   * целым. Без предела пятьдесят обменов по двадцать секунд заняли бы
   * шестнадцать минут в одной ручке, и за реверс-прокси человек получил бы
   * `504`, пока сервер продолжает выгружать: он не узнал бы ни одного итога,
   * а повторное нажатие пошло бы `PUT` по задачам, которые уже уехали.
   *
   * Исход — успешный ответ с итогом на каждую задачу, а не один код HTTP
   * (ручка отдаёт `201` — умолчание Nest для `POST`): `502` на
   * наборе, где три задачи уехали, сказал бы «ничего не вышло» и заставил
   * бы нажать повтор, то есть править в трекере то, что уже правильно.
   */
  async export(
    subject: RequestSubject,
    projectId: string,
    input: TaskExportRequest,
  ): Promise<TaskExportResult[]> {
    await this.bindings.requireWrite(subject, projectId);

    const binding = await this.bindings.findForProject(subject, projectId);

    // Привязка называется прежде ненастроенного подключения: она — настройка
    // его собственного проекта, и отказ про чужую настройку отправил бы
    // человека к администратору, не сказав, что у него и доска не выбрана.
    if (binding === null) {
      throw new TrackerBindingMissingError();
    }

    const port = await this.trackers.current();

    // Выключенный порт отказывает на каждой операции сам, но доходить до
    // него нельзя: до отказа успела бы лечь запись журнала о передаче,
    // которой не будет, — а журнал неизменяем.
    if (!port.isEnabled) {
      throw new TrackerNotConfiguredError();
    }

    const targets = await this.exports.targetsOf(subject, projectId, input.taskIds);
    // Сигнал принадлежит службе: обрыв в `finally` не даёт запросу пережить
    // вызов, а свой предел ожидания ставит адаптер — он один знает, сколько
    // готов ждать этот узел.
    const controller = new AbortController();
    const results: TaskExportResult[] = [];
    // Отсчёт идёт от набора, а не от обмена: предел — про срок ответа ручки,
    // и считать его заново у каждой задачи значило бы не иметь предела вовсе.
    const startedAt = Date.now();
    let broken = false;

    try {
      for (const target of targets) {
        // Спрашивается не «кончилось ли время», а «успеет ли **ещё один**
        // обмен целиком»: иначе предел не выполнялся бы ровно при медленном
        // трекере, ради которого он и поставлен. Проверка стоит до замка и
        // до журнала: нет обмена — нет и записи о передаче, которой не было.
        if (broken || Date.now() - startedAt >= EXPORT_BATCH_START_BEFORE_MS) {
          results.push(skipped(target));
          continue;
        }

        const result = await this.exportOne(subject, projectId, port, binding, target, controller);

        results.push(result ?? skipped(target));
        broken = result?.outcome === TaskExportOutcome.Failed;
      }
    } finally {
      controller.abort();
    }

    return results;
  }

  /** Связать по сохранённой ссылке: в Weeek идут только GET-запросы. */
  async link(subject: RequestSubject, projectId: string, taskId: string): Promise<TaskExport> {
    await this.bindings.requireWrite(subject, projectId);
    const binding = await this.bindings.findForProject(subject, projectId);

    if (!binding) {
      throw new TrackerBindingMissingError();
    }

    const port = await this.trackers.current();

    if (!port.isEnabled) {
      throw new TrackerNotConfiguredError();
    }

    const controller = new AbortController();

    try {
      return await this.lockDb.transaction(async (lockTx) => {
        const target = await this.exports.lockTarget(subject, lockTx, projectId, taskId);

        if (!target) {
          throw new NotFoundException();
        }

        const link = weeekTaskLinkOf(target.url);

        if (!link) {
          throw new BadRequestException({
            code: TRACKER_LINK_INVALID,
            message: 'Укажите постоянную ссылку Weeek вида https://app.weeek.net/ws/123/task/456.',
          });
        }

        if (target.export) {
          if (
            target.export.externalId === link.taskId &&
            weeekTaskLinkOf(target.export.externalUrl)?.workspaceId === link.workspaceId
          ) {
            return target.export;
          }

          throw new ConflictException({
            code: TRACKER_LINK_INVALID,
            message: 'Задача уже связана с другой задачей Weeek.',
          });
        }

        let state: TrackerTaskState;

        try {
          state = await port.readTaskLink(target.url!, targetOf(binding), controller.signal);
        } catch (cause) {
          throw new BadGatewayException({
            code: codeOf(cause),
            message: 'Не удалось прочитать задачу Weeek. Проверьте ссылку, рабочее пространство и выбранную доску.',
          });
        }

        return this.db.transaction(async (tx) => {
          await this.exports.recordExported(subject, tx, projectId, taskId, {
            tracker: port.kind,
            boardId: binding.boardId,
            state,
          });
          await this.audit.record(tx, actorOf(subject), {
            action: AuditAction.TaskTrackerLinked,
            entityType: 'task',
            entityId: taskId,
            projectId,
            metadata: { tracker: port.kind, externalId: state.externalId, boardId: binding.boardId },
          });
          const row = await this.exports.recordPolled(tx, taskId, { tracker: port.kind, state, code: null });

          return taskExportOfRow(row!);
        });
      });
    } finally {
      controller.abort();
    }
  }

  /**
   * Одна задача под замком: решение, журнал, вызов, запись.
   *
   * Отдельным методом, а не телом цикла, ровно затем, чтобы порядок шагов
   * читался целиком на одном экране: он и есть инвариант этого файла.
   *
   * **Замок берётся на каждую задачу отдельно, а не на набор**: ждать
   * придётся только тому, кто выгружает ту же задачу, а не тому, кто
   * выгружает соседнюю, — и правка формулировок остального реестра не
   * останавливается на всё время набора.
   *
   * **Решение читается заново, под замком** ({@link
   * TaskExportsRepository.lockTarget}), а не берётся из набора: набор читался
   * без замка, и его зеркало — знание до ожидания. Ровно в этом и состояла
   * гонка: оба писателя видели «выгрузки нет» и заводили по задаче.
   *
   * `null` в ответе — задачи больше нет: её унесли, пока шёл набор. Наружу
   * идти незачем, а уронить `404` посреди набора значило бы потерять итоги
   * уже уехавших задач — ответ обязан прийти целым.
   */
  private async exportOne(
    subject: RequestSubject,
    projectId: string,
    port: Tracker,
    binding: TrackerBinding,
    target: TaskExportTarget,
    controller: AbortController,
  ): Promise<TaskExportResult | null> {
    return this.lockDb.transaction(async (lockTx) => {
      const decision = await this.exports.lockTarget(subject, lockTx, projectId, target.taskId);

      return decision === null
        ? null
        : this.exchangeOne(subject, projectId, port, binding, decision, controller);
    });
  }

  /**
   * Журнал, вызов, запись — под уже взятым замком задачи.
   *
   * Отдельно от {@link exportOne}, потому что обе записи идут **своими**
   * транзакциями на рабочем подключении, пока замок держится на своём: нет
   * записи — нет и передачи, а запись, которая коммитится вместе с замком,
   * потерялась бы ровно при обрыве посреди вызова — то есть в единственном
   * случае, ради которого она и пишется заранее.
   */
  private async exchangeOne(
    subject: RequestSubject,
    projectId: string,
    port: Tracker,
    binding: TrackerBinding,
    target: TaskExportTarget,
    controller: AbortController,
  ): Promise<TaskExportResult> {
    const isFirst = target.export === null;
    // Ручная ссылка на Weeek означает уже существующую задачу. Создавать дубль нельзя.
    if (isFirst && isWeeekLink(target.url)) {
      return {
        taskId: target.taskId,
        outcome: TaskExportOutcome.Failed,
        failureCode: TRACKER_LINK_REQUIRED,
        export: null,
      };
    }

    await this.db.transaction((tx) =>
      this.audit.record(tx, actorOf(subject), {
        action: isFirst ? AuditAction.TaskExported : AuditAction.TaskExportUpdated,
        entityType: 'task',
        entityId: target.taskId,
        projectId,
        metadata: {
          tracker: port.kind,
          host: port.host,
          boardId: binding.boardId,
          // Формулировка названа намеренно, в отличие от правки задачи: она
          // и так уходит наружу, и журнал передачи, умалчивающий о
          // переданном, не отвечает на вопрос, ради которого он пишется.
          // Токена здесь нет ни под каким именем — он живёт в приватном поле
          // адаптера и наружу не выходит вовсе.
          title: target.title,
          // У повторной выгрузки — та задача трекера, которую правили;
          // `null` означает «её там ещё не было».
          externalId: target.export?.externalId ?? null,
        },
      }),
    );

    let state: TrackerTaskState;

    try {
      state = isFirst
        ? await port.createTask({ title: target.title }, targetOf(binding), controller.signal)
        : await port.updateTask(
            target.export!.externalId,
            { title: target.title },
            controller.signal,
          );
    } catch (cause) {
      const code = codeOf(cause);
      const row = await this.db.transaction((tx) =>
        this.exports.recordFailure(subject, tx, projectId, target.taskId, {
          tracker: port.kind,
          code,
        }),
      );

      return {
        taskId: target.taskId,
        outcome: TaskExportOutcome.Failed,
        failureCode: code,
        // Пусто у первой неудачи: строки выгрузки так и нет, и писать её
        // было некуда.
        export: row === null ? null : taskExportOfRow(row),
      };
    }

    const row = await this.db.transaction((tx) =>
      this.exports.recordExported(subject, tx, projectId, target.taskId, {
        tracker: port.kind,
        boardId: binding.boardId,
        state,
      }),
    );

    return {
      taskId: target.taskId,
      outcome: isFirst ? TaskExportOutcome.Created : TaskExportOutcome.Updated,
      failureCode: null,
      export: taskExportOfRow(row),
    };
  }
}

/**
 * Итог задачи, с которой не произошло ничего.
 *
 * Один вид на три причины — набор остановился на отказе, кончилось время,
 * задачу унесли, — и это решение: исход говорит о **задаче**, а не о
 * причине, по которой до неё не дошли. Зеркало отдаётся прежним, каким
 * прочитан набор: оно и есть «как было».
 */
function skipped(target: TaskExportTarget): TaskExportResult {
  return {
    taskId: target.taskId,
    outcome: TaskExportOutcome.Skipped,
    failureCode: null,
    export: target.export,
  };
}

/**
 * Куда класть задачу: привязка проекта, разобранная на три значения.
 *
 * Проекция привязки, а не она сама: у `TrackerBinding` есть ещё `tracker`,
 * `updatedAt` и имя правившего, и передать её в порт целиком значило бы
 * показать адаптеру то, что к обмену не относится вовсе.
 */
function targetOf(binding: TrackerBinding): TrackerTarget {
  return {
    externalProjectId: binding.externalProjectId,
    boardId: binding.boardId,
    boardColumnId: binding.boardColumnId,
  };
}

/**
 * Код неудачи обмена.
 *
 * Чужое исключение без своего кода получает «не ответил»: различать его
 * нечем, а в тексте бывает что угодно — и присланная нами формулировка, и
 * сам токен в сообщении о неверном заголовке. Поэтому наружу и в базу идёт
 * код, а не текст.
 */
function codeOf(cause: unknown): string {
  return cause instanceof TrackerFailure ? cause.code : TRACKER_UNAVAILABLE;
}

/** Актор журнала из субъекта запроса. */
function actorOf(subject: RequestSubject): AuditActor {
  return {
    kind: subject.kind as unknown as Exclude<AuditSubjectKind, AuditSubjectKind.System>,
    id: subject.id,
    label: subject.label,
  };
}
