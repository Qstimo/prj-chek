import {
  ModelProbeOutcome,
  weeekTaskLinkOf,
  TRACKER_LINK_INVALID,
  TRACKER_REJECTED,
  TRACKER_UNAVAILABLE,
  TrackerKind,
  type TrackerProbeResult,
  type TrackerTargets,
} from '@cairn/shared';

import { probeOutcomeOf } from '../summaries/suggester/probe-outcome';
import type { TrackerSettings } from './tracker.settings';
import {
  TrackerFailure,
  type Tracker,
  type TrackerTarget,
  type TrackerTaskInput,
  type TrackerTaskState,
} from './tracker';

/**
 * Узел кабинета Weeek — только для человеческой ссылки на задачу.
 *
 * Настройкой не является намеренно: это не **наш** узел и не адрес API, а
 * адрес их веб-интерфейса, и предложить администратору настроить его значило
 * бы предложить настроить чужой продукт.
 *
 * **Шаблон живым токеном не проверен** (дизайн, 10.4), и поэтому он
 * второй по старшинству: ссылка берётся из ответа трекера, когда она там
 * есть, и собирается по шаблону лишь когда задано пространство. Нет ни
 * того, ни другого — ссылки нет вовсе: выдуманная ссылка хуже
 * отсутствующей, потому что по ней идут и попадают не туда.
 */
const WORKSPACE_TASK_URL = (workspaceId: string, taskId: string): string =>
  `https://app.weeek.net/ws/${workspaceId}/task/${taskId}`;

/**
 * Предел читаемого тела ответа, в знаках.
 *
 * Разбор чужого мегабайта — это наша память, а не их щедрость: предел стоит
 * до `JSON.parse`, а не после. Числом меньше, чем у расшифровки: здесь
 * читается список задач доски, а не поток событий распознавания.
 */
const MAX_RESPONSE_CHARS = 2_000_000;

/**
 * Сколько строк просим на страницу списка.
 *
 * **Имена параметров пагинации живым токеном не проверены** (дизайн, 10.4):
 * `perPage` и `offset` взяты как самые вероятные у публичного REST. Сотня —
 * не выдумка: это общий предел страницы у таких API, и просить больше
 * значило бы рисковать отказом «страница слишком велика» там, где отказ
 * роняет весь обход.
 *
 * Поведение не зависит от того, понял ли сервер эти имена: страница короче
 * просимой кончает обход, а страница, пришедшая той же (сервер проигнорировал
 * смещение), кончает его повтором идентификаторов — см. {@link listed}.
 * Поэтому неверная догадка стоит одного лишнего запроса, а не зеркала.
 */
export const TRACKER_LIST_PAGE_SIZE = 100;

/**
 * Сколько страниц читаем подряд, прежде чем остановиться.
 *
 * Предел нужен не полноте, а **времени**: чужая пагинация, отдающая полные
 * страницы без конца (сервер, считающий `offset` по-своему, или доска,
 * растущая быстрее обхода), иначе читалась бы до предела ожидания — и один
 * такой список занял бы весь тик прогона.
 *
 * Названная граница: доска длиннее двух тысяч задач читается не до конца, и
 * о задачах за пределом зеркало ничего не узнает. Отказ вместо усечения
 * отвергнут дороже — он выбросил бы и те задачи, о которых трекер
 * рассказал, то есть заморозил бы зеркало целиком вместо его хвоста.
 */
export const TRACKER_MAX_LIST_PAGES = 20;

/**
 * Адаптер Weeek (дизайн, раздел 6).
 *
 * Проверено живыми запросами 2026-11-20: `POST/GET /tm/tasks`,
 * `GET/PUT/DELETE /tm/tasks/{id}`, `POST /tm/tasks/{id}/complete`,
 * `/tm/projects`, `/tm/boards`, `/tm/board-columns`, `/ws`, `/ws/members`,
 * `/ws/tags`. Вебхуков в публичном API нет (`/ws/webhooks` → `404`), поэтому
 * внешнее состояние приходит только опросом.
 *
 * Повторов не делает: повтор — это нажатие человека. Автоповтор на выгрузке
 * был бы способом завести в трекере вторую задачу молча — `POST /tm/tasks`
 * идемпотентным не объявлен нигде.
 *
 * `POST /tm/tasks/{id}/complete` в адаптере не вызывается ни откуда, хотя
 * он существует: внешнее состояние — **зеркало**, и закрывать чужую задачу
 * по своей кнопке мы не вправе (дизайн, 5).
 */
export class WeeekTracker implements Tracker {
  /**
   * Настройки в истинно приватном поле, а не в `private readonly`.
   *
   * `private` в TypeScript — проверка компилятора, и только: в готовом
   * объекте поле остаётся обычным, а значит токен уехал бы наружу первым же
   * `JSON.stringify` порта. Поле с `#` недоступно ни снаружи, ни
   * сериализации.
   */
  readonly #settings: TrackerSettings;
  #workspaceId: string | null;

  constructor(settings: TrackerSettings) {
    this.#settings = settings;
    this.#workspaceId = settings.workspaceId;
  }

  get kind(): TrackerKind {
    return TrackerKind.Weeek;
  }

  get host(): string | null {
    return this.#settings.host;
  }

  get isEnabled(): boolean {
    return this.#settings.isEnabled;
  }

  /**
   * Кладёт задачу на доску привязки.
   *
   * В теле — формулировка и три идентификатора привязки, и ничего больше.
   * Необязательные поля Weeek (`day`, `type`, `priority`) не отправляются:
   * сроки и приоритеты ТЗ 1.4 выносит за объём, и у задачи CAIRN их нет —
   * отправить здесь значение означало бы выдумать его.
   */
  async createTask(
    input: TrackerTaskInput,
    target: TrackerTarget,
    signal: AbortSignal,
  ): Promise<TrackerTaskState> {
    // Один предел на определение пространства и создание вместе.
    signal = AbortSignal.any([signal, AbortSignal.timeout(this.#settings.timeoutSeconds * 1000)]);
    // Для ссылки нужен id пространства. Пользователю достаточно токена:
    // если id не задан, узнаём его до создания, чтобы отказ не оставил задачу без ссылки.
    if (!this.#workspaceId) {
      const workspace = await this.exchange('/ws', { method: 'GET' }, signal);
      this.#workspaceId = idOf(objectOf(workspace, 'workspace')?.id);
      if (!this.#workspaceId) throw this.rejected('в ответе нет рабочего пространства');
    }
    const payload = await this.exchange(
      '/tm/tasks',
      {
        method: 'POST',
        body: {
          title: input.title,
          projectId: target.externalProjectId,
          boardId: target.boardId,
          boardColumnId: target.boardColumnId,
        },
      },
      signal,
    );

    return this.stateOf(objectOf(payload, 'task'));
  }

  /**
   * Правит уже выгруженную задачу.
   *
   * `PUT`, а не `PATCH`: `PATCH /tm/tasks/{id}` Weeek не поддерживает —
   * проверено, `405` (дизайн, 6).
   *
   * Доска и колонка в теле **не отправляются**, хотя привязка их знает:
   * человек мог сам перетащить задачу в другую колонку, и наша правка
   * формулировки не вправе возвращать её назад. Повторная выгрузка правит
   * задачу (решение владельца), а не переносит её.
   */
  async updateTask(
    externalId: string,
    input: TrackerTaskInput,
    signal: AbortSignal,
  ): Promise<TrackerTaskState> {
    const payload = await this.exchange(
      `/tm/tasks/${encodeURIComponent(externalId)}`,
      { method: 'PUT', body: { title: input.title } },
      signal,
    );

    return this.stateOf(objectOf(payload, 'task'));
  }

  /**
   * Спрашивает состояние задач доски.
   *
   * Запрос идёт по проекту и доске, а не по набору наших идентификаторов:
   * есть ли у `GET /tm/tasks` фильтр по набору id — живым токеном не
   * проверено (дизайн, 10.4), и ветка «по доске» работает в обоих случаях.
   * Лишние задачи в ответе безвредны — вызывающий сводит их по своим
   * выгрузкам, а задачи, которой он не знает, он просто не найдёт.
   *
   * **Доска читается до исчерпания страниц** ({@link listed}), и это не
   * забота о полноте ради полноты: вызывающий трактует отсутствие задачи в
   * ответе как «о ней не было ни слова» и пишет одну отметку проверки.
   * Прочитай адаптер одну страницу — и у доски больше сотни задач зеркало
   * хвоста замерло бы навсегда, показывая при этом свежее «спрашивали только
   * что», то есть врало бы увереннее, чем молчало.
   */
  async readTasks(target: TrackerTarget, signal: AbortSignal): Promise<TrackerTaskState[]> {
    const tasks = await this.listed(
      '/tm/tasks',
      { projectId: target.externalProjectId, boardId: target.boardId },
      ['tasks'],
      signal,
    );

    return tasks.map((task) => this.stateOf(task));
  }

  /** Проверка существующей ссылки: пространство токена и расположение задачи. */
  async readTaskLink(url: string, target: TrackerTarget, signal: AbortSignal): Promise<TrackerTaskState> {
    signal = AbortSignal.any([signal, AbortSignal.timeout(this.#settings.timeoutSeconds * 1000)]);
    const link = weeekTaskLinkOf(url);
    const invalid = () => new TrackerFailure(TRACKER_LINK_INVALID,
      'Не удалось связать задачу: проверьте ссылку, рабочее пространство и выбранную доску.');
    if (!link) throw invalid();

    // Идентификаторы задач локальны для пространства: один taskId недостаточен.
    const workspace = await this.exchange('/ws', { method: 'GET' }, signal);
    if (idOf(objectOf(workspace, 'workspace')?.id) !== link.workspaceId) throw invalid();
    const payload = await this.exchange(`/tm/tasks/${encodeURIComponent(link.taskId)}`, { method: 'GET' }, signal);
    const task = objectOf(payload, 'task');
    if (!task || idOf(task.id) !== link.taskId || task.isDeleted === true) throw invalid();
    const locations = Array.isArray(task.locations) ? task.locations : [task];
    const location = locations.find((item: Record<string, unknown> | null) =>
      item && idOf(item.projectId) === target.externalProjectId && idOf(item.boardId) === target.boardId);
    if (!location) throw invalid();
    return {
      ...this.stateOf(task),
      externalUrl: `https://app.weeek.net/ws/${link.workspaceId}/task/${link.taskId}`,
      boardId: target.boardId,
      boardColumnId: idOf(location.boardColumnId),
    };
  }

  /**
   * Списки для привязки: проекты, доски и колонки.
   *
   * Три запроса разом, а не по очереди: списки независимы, и человек ждёт
   * один раз вместо трёх. Отказ любого роняет всю операцию — привязка
   * собирается из трёх списков, и форма с двумя предложила бы выбрать
   * колонку из пустоты.
   *
   * Каждый список листается до исчерпания, тем же правилом, что задачи: в
   * установке с сотнями досок привязку иначе нельзя было бы поставить вовсе,
   * а выглядело бы это как «у вас нет такой доски» — самый вводящий в
   * заблуждение ответ, он отправляет человека завести доску, которая у него
   * уже есть.
   */
  async targets(signal: AbortSignal): Promise<TrackerTargets> {
    const [projects, boards, columns] = await Promise.all([
      this.listed('/tm/projects', {}, ['projects'], signal),
      this.listed('/tm/boards', {}, ['boards'], signal),
      this.listed(
        '/tm/board-columns',
        {},
        ['boardColumns', 'board_columns', 'columns'],
        signal,
      ),
    ]);

    return {
      projects: identified(projects, () => ({})),
      boards: identified(boards, (row) => ({
        projectId: idOf(row.projectId),
      })),
      columns: identified(columns, (row) => ({
        boardId: idOf(row.boardId),
      })),
    };
  }

  /**
   * Читает пространство и отдаёт исход.
   *
   * `GET /ws` — потому что проверка связи обязана ничего не создавать и
   * ничего не стоить: пробная задача осталась бы в чужом трекере, а убрать
   * её значило бы завести в адаптере удаление, которого в порту нет
   * намеренно (дизайн, 10.5).
   *
   * Наружу идут исход, код HTTP числом, имя узла и длительность; тела
   * чужого ответа нет ни целиком, ни фрагментом, ни в `cause`: в нём бывает
   * и сам токен — в сообщении о неверном заголовке.
   */
  async probe(signal: AbortSignal): Promise<TrackerProbeResult> {
    const startedAt = Date.now();
    let response: Response;

    try {
      response = await this.send('/ws', { method: 'GET' }, signal);
    } catch {
      return this.probeResult(ModelProbeOutcome.Unavailable, null, startedAt);
    }

    const outcome = probeOutcomeOf(response.status);

    if (outcome !== ModelProbeOutcome.Ok) {
      return this.probeResult(outcome, response.status, startedAt);
    }

    let payload: string;

    try {
      payload = await response.text();
    } catch {
      return this.probeResult(ModelProbeOutcome.Unavailable, response.status, startedAt);
    }

    // Проверяется ровно то, что узел прислал разбираемое содержимое: за
    // «успехом» с HTML-страницей входа в кабинет стоит не наш API, и
    // назвать такой ответ удачей значило бы отпустить человека с
    // настройкой, которая не работает.
    const isReadable = payload.length <= MAX_RESPONSE_CHARS && objectOrNull(payload) !== null;

    return this.probeResult(
      isReadable ? ModelProbeOutcome.Ok : ModelProbeOutcome.BadResponse,
      response.status,
      startedAt,
    );
  }

  /**
   * Список целиком: страница за страницей, пока они не кончатся.
   *
   * Общий на задачи доски и на три списка привязки, потому что правило
   * остановки у них обязано совпадать: обход, устроенный в двух местах
   * по-разному, в одном из них рано или поздно прочитает одну страницу.
   *
   * Обход кончается по одному из трёх условий, и каждое отвечает за свой
   * случай:
   *
   * 1. **страница короче просимой** — она последняя. Сюда же попадает
   *    сервер, не понявший `perPage` и отдавший всё одним ответом;
   * 2. **страница не принесла ни одной новой строки** — сервер не понял
   *    `offset` и отдал ту же страницу (имена параметров живым токеном не
   *    проверены, дизайн 10.4). Сравниваются идентификаторы, а не тела
   *    строк: у задачи между двумя нашими запросами мог измениться столбец,
   *    и сравнение целиком приняло бы ту же страницу за новую — то есть
   *    превратило бы догадку о параметре в бесконечный обход;
   * 3. **предел числа страниц** ({@link TRACKER_MAX_LIST_PAGES}).
   *
   * Повторы строк отбрасываются по идентификатору, а не только в конце
   * обхода: сервер, тасующий порядок между страницами, иначе отдал бы одну
   * доску в списке выбора дважды. Строка **без** идентификатора остаётся —
   * решать, отказ это или пропуск, вправе вызывающий: у задач отказ (без
   * идентификатора её больше не найти), у списков привязки пропуск.
   */
  private async listed(
    path: string,
    params: Record<string, string>,
    keys: string[],
    signal: AbortSignal,
  ): Promise<Record<string, unknown>[]> {
    const collected: Record<string, unknown>[] = [];
    const seen = new Set<string>();

    for (let page = 0; page < TRACKER_MAX_LIST_PAGES; page += 1) {
      const query = new URLSearchParams({
        ...params,
        perPage: String(TRACKER_LIST_PAGE_SIZE),
        offset: String(page * TRACKER_LIST_PAGE_SIZE),
      });
      const payload = await this.exchange(
        `${path}?${query.toString()}`,
        { method: 'GET' },
        signal,
      );
      const rows = arrayOf(payload, keys);
      let added = 0;

      for (const row of rows) {
        const id = idOf(row.id);

        if (id !== null) {
          if (seen.has(id)) {
            continue;
          }

          seen.add(id);
        }

        collected.push(row);
        added += 1;
      }

      if (added === 0 || rows.length < TRACKER_LIST_PAGE_SIZE) {
        break;
      }
    }

    return collected;
  }

  /**
   * Один обмен с трекером: запрос, разбор кода, разбор тела.
   *
   * Общий на все операции, потому что заголовки, запрет переадресации,
   * предел ожидания и правила отказа у них обязаны совпадать: проверка,
   * идущая другим путём, проверяла бы не тот путь, которым пойдёт задача.
   */
  private async exchange(
    path: string,
    init: { method: string; body?: unknown },
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    let response: Response;

    try {
      response = await this.send(path, init, signal);
    } catch {
      // Ни текст чужой ошибки, ни её причина сюда не попадают: в них
      // бывает и токен, и присланная нами формулировка.
      throw this.unavailable('узел не ответил');
    }

    if (!response.ok) {
      // `429` и `5xx` — «не ответил», всё прочее — «отказал»: различие в
      // том, что делать, а не в том, что случилось. Первое лечится
      // повтором, второе — правкой настройки.
      throw response.status === 429 || response.status >= 500
        ? this.unavailable(`узел ответил ${response.status}`)
        : this.rejected(`узел ответил ${response.status}`);
    }

    let payload: string;

    try {
      payload = await response.text();
    } catch {
      throw this.unavailable('ответ не дочитался');
    }

    if (payload.length > MAX_RESPONSE_CHARS) {
      throw this.rejected('ответ длиннее допустимого');
    }

    const parsed = objectOrNull(payload);

    if (parsed === null) {
      throw this.rejected('ответ не разобрался');
    }

    return parsed;
  }

  /** Запрос к трекеру: один путь на все операции. */
  private send(
    path: string,
    init: { method: string; body?: unknown },
    signal: AbortSignal,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      // Схема одна и жёсткая: `Authorization: Bearer <token>` — проверено
      // живыми запросами. Выбора схем, как у узлов модели, здесь нет, и
      // настройка с выбором намекала бы, что вторая схема тоже законна.
      Authorization: `Bearer ${this.#settings.token}`,
      Accept: 'application/json',
    };

    if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    return fetch(`${trimSlash(this.#settings.baseUrl)}${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      // Адрес трекера задаёт только настройка, и переадресация его меняет.
      // Умолчание `fetch` — `follow`, а `307` и `308` сохраняют метод и
      // тело: настроенный трекер одним ответом переслал бы формулировки
      // задач на любой чужой адрес вместе с токеном в заголовке.
      // Переадресация — смена настройки, а не маршрут, поэтому она отказ.
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(this.#settings.timeoutSeconds * 1000)]),
    });
  }

  /** Состояние задачи из её объекта в ответе. Без `id` — отказ. */
  private stateOf(task: Record<string, unknown> | null): TrackerTaskState {
    const externalId = task === null ? null : idOf(task.id);

    if (externalId === null || task === null) {
      // Задача без идентификатора — это задача, которую мы больше никогда
      // не найдём: ни правкой, ни опросом. Записать такую выгрузку значило
      // бы соврать экрану, что она состоялась.
      throw this.rejected('в ответе нет задачи');
    }

    return {
      externalId,
      externalUrl: this.urlOf(task, externalId),
      boardId: idOf(task.boardId),
      boardColumnId: idOf(task.boardColumnId),
      // Отсутствие признака читается как «не закрыта»: зеркало ничего не
      // закрывает, и «неизвестно» здесь безопаснее трактовать в пользу
      // открытой задачи — она останется в обходе опроса.
      isCompleted: task.isCompleted === true,
    };
  }

  /** Ссылка из ответа, иначе по шаблону, иначе никакая. */
  private urlOf(task: Record<string, unknown>, externalId: string): string | null {
    for (const candidate of [task.url, task.link]) {
      if (typeof candidate === 'string' && candidate.startsWith('https://')) {
        return candidate;
      }
    }

    const workspaceId = this.#workspaceId;

    return workspaceId === null || workspaceId === ''
      ? null
      : WORKSPACE_TASK_URL(workspaceId, externalId);
  }

  /** Исход проверки связи: длительность считается здесь одним способом. */
  private probeResult(
    outcome: ModelProbeOutcome,
    status: number | null,
    startedAt: number,
  ): TrackerProbeResult {
    return {
      outcome,
      status,
      host: this.#settings.host,
      durationMs: Date.now() - startedAt,
    };
  }

  /** «Не ответил»: повторить можно. */
  private unavailable(reason: string): TrackerFailure {
    return new TrackerFailure(TRACKER_UNAVAILABLE, this.text(reason));
  }

  /** «Отказал»: чинится правкой настройки. */
  private rejected(reason: string): TrackerFailure {
    return new TrackerFailure(TRACKER_REJECTED, this.text(reason));
  }

  /**
   * Текст отказа: имя узла есть, токена и чужого тела нет.
   *
   * Человеку нужно знать, кто отказал, а не что именно он прислал: в
   * присланном бывает и эхо нашей формулировки, и сам токен.
   */
  private text(reason: string): string {
    return `Обмен с трекером не удался: ${this.#settings.host ?? 'трекер'} — ${reason}.`;
  }
}

/** Объект тела либо `null`, когда разобрать нечего. */
function objectOrNull(payload: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(payload);

    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Вложенный объект по имени поля либо `null`. */
function objectOf(payload: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = payload[key];

  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Список по одному из названных имён поля.
 *
 * Имён несколько там, где написание не подтверждено живым токеном (дизайн,
 * 10.4): ответ, прочитанный не тем ключом, выглядел бы пустым списком, то
 * есть «у вас нет досок», — а это самый вводящий в заблуждение из
 * возможных ответов, он отправляет человека завести доску, которая у него
 * уже есть.
 */
function arrayOf(payload: Record<string, unknown>, keys: string[]): Record<string, unknown>[] {
  for (const key of keys) {
    const value = payload[key];

    if (Array.isArray(value)) {
      return value.filter(
        (row): row is Record<string, unknown> => typeof row === 'object' && row !== null,
      );
    }
  }

  return [];
}

/**
 * Цели с идентификатором; остальные выбрасываются.
 *
 * Строка без `id` **не** отдаётся с пустым идентификатором, хотя так короче:
 * пустое значение в селекте уже занято — им помечено «не выбрано», — и такая
 * цель была бы от отсутствия выбора неотличима. Выбрать её человек всё равно
 * не смог бы: контракт требует непустые идентификаторы и у цели
 * (`trackerTargetSchema`), и у привязки (`trackerBindingUpdateSchema`).
 * Молча пропасть из списка здесь честнее: такой цели у нас и нет.
 *
 * Родитель дописывается вызывающим, а не читается здесь: у проекта его не
 * бывает вовсе, а у доски и колонки он называется разными полями.
 */
function identified<T extends object>(
  rows: Record<string, unknown>[],
  parentOf: (row: Record<string, unknown>) => T,
): ({ id: string; name: string } & T)[] {
  return rows.flatMap((row) => {
    const id = idOf(row.id);

    return id === null ? [] : [{ id, name: nameOf(row), ...parentOf(row) }];
  });
}

/**
 * Идентификатор чужой системы строкой.
 *
 * Weeek отдаёт числа, а мы храним текст: арифметики над ними нет, у второго
 * трекера они могут быть не числом, а большое число потеряло бы точность в
 * JS молча. `0` и пустая строка идентификатором не считаются — они
 * означают «поля нет», и привязка к доске `0` нашлась бы не там, где её
 * ищут.
 */
function idOf(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value !== 0) {
    return String(value);
  }

  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** Имя для выбора человеком; трекер без имени даёт пустую строку. */
function nameOf(row: Record<string, unknown>): string {
  for (const candidate of [row.name, row.title]) {
    if (typeof candidate === 'string') {
      return candidate;
    }
  }

  return '';
}

/** Адрес без замыкающей косой черты: иначе в пути окажется двойная. */
function trimSlash(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}
