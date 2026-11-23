import { TRACKER_UNAVAILABLE } from '@cairn/shared';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import {
  TaskExportsRepository,
  type TaskExportPollTarget,
  type TaskPollResult,
} from './task-exports.repository';
import {
  TRACKER_SOURCE,
  TrackerFailure,
  type Tracker,
  type TrackerSource,
  type TrackerTarget,
  type TrackerTaskState,
} from './tracker';
import { TRACKER_POLL_ENV, trackerPollSecondsOf } from './tracker-poll';

/** Чем кончился запрос на тик. */
export enum TrackerPollOutcome {
  /** Тик состоялся целиком. */
  Done = 'done',
  /** Тик уже идёт — здесь или в другом экземпляре API. */
  Busy = 'busy',
}

/**
 * Токен соединения, на котором держится замок тика.
 *
 * Отдельно от рабочего подключения по той же причине, что у прогонов
 * проверок и расшифровок: замок занимает соединение на весь тик, а в тестах
 * рабочий пул состоит из единственного соединения — занять его значило бы
 * запереть сам прогон. В развёртывании это тот же пул, что и `DATABASE`.
 */
export const TRACKER_POLL_LOCK_DB = Symbol('TRACKER_POLL_LOCK_DB');

/**
 * Ключ замка тика: класс «CAIRN», объект «прогон опроса трекера».
 *
 * Тот же класс, что у прогонов проверок (объект 1) и расшифровок (объект 2);
 * здесь объект 3. Пара чисел читается глазами и не столкнётся с чужим
 * замком.
 */
const LOCK_CLASS = 0x4341_4952;
const LOCK_OBJECT = 3;

/**
 * Сколько задач берётся в один тик.
 *
 * **Константа в коде, а не переменная окружения**, и считает она не вопросы,
 * а записи: вопрос задаётся по **доске** (один `GET` отвечает обо всех её
 * задачах), поэтому частоту обращений к чужому API задаёт число привязанных
 * проектов, а не это число. Предел нужен другому — чтобы работа тика не
 * росла вместе с реестром: тик обязан быть короче интервала, иначе прогон
 * начнёт догонять сам себя.
 *
 * Голодания он не создаёт: порядок обхода — «кого дольше не спрашивали»
 * (`checked_at asc nulls first`), и задача, не попавшая в этот тик,
 * оказывается в голове очереди следующего. Переменная окружения завела бы
 * настройку, о которой не говорит ни README, ни экран, — ровно ту полосу
 * имён, которую с карточки узла модели уже снимали.
 */
export const MAX_POLLED_PER_TICK = 200;

/**
 * Фоновый прогон опроса статусов трекера (дизайн, 8).
 *
 * Устройство повторяет `StatusRunnerService` и
 * `TranscriptionRunnerService`, и это повторение, а не совпадение: замок
 * лежит **в базе** (`pg_try_advisory_xact_lock`) на **отдельном
 * соединении**, он **уровня транзакции**, а признак идущего тика
 * захватывается **синхронно**, до первого `await`. В памяти замок не
 * защитил бы от второго экземпляра API за прокси, а два тика сразу — это
 * два одинаковых вопроса в API, который считает частоту.
 *
 * Три отличия от соседних прогонов, и каждое надо назвать прямо, иначе их
 * прочтут как небрежность:
 *
 * 1. **при подъёме тик не идёт.** У прогона проверок он нужен: без него
 *    только что вписанный адрес до четверти часа остаётся «неизвестно». У
 *    расшифровки — тоже: загруженная запись иначе ждала бы лишние двадцать
 *    секунд. Здесь же зеркало уже лежит в базе и старше интервала не
 *    бывает, а деплой перезапускает API — то есть каждый перезапуск стучался
 *    бы в чужой API ради знания, которым никто не распоряжается
 *    автоматически;
 * 2. **в журнал действий тик не пишет ничего, и записи о передаче у него
 *    нет вовсе.** Наружу не уходит ни байта содержимого проекта: вопрос
 *    состоит из идентификаторов доски и проекта в трекере. Запись
 *    «передали» ставится там, где уезжает формулировка, — в выгрузке
 *    (`TaskExportsService`), и ставить её здесь значило бы называть передачей
 *    то, что ею не является;
 * 3. **тяжёлого шага у тика нет**, поэтому и бюджета в один шаг нет: вопрос
 *    о доске — короткий `GET` без тела, и ограничен тик числом **записей**
 *    (см. {@link MAX_POLLED_PER_TICK}), а не числом походов в сеть.
 *
 * **Зеркало ничего не закрывает** (решение владельца, дизайн 5): чекпоинтов
 * прогон не касается ни одним запросом, прогресс версии считается только из
 * них, а расхождение «в трекере закрыто, здесь открыто» показывается биркой.
 * Это сторожится тестом прямо: тик не меняет ни одной строки размещения.
 */
@Injectable()
export class TrackerPollRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrackerPollRunnerService.name);
  private timer: NodeJS.Timeout | null = null;
  /**
   * Идущий тик, если он есть.
   *
   * Память не заменяет замок базы: она сразу отсеивает повторный запрос в
   * том же процессе, пока первый ещё получает соединение и замок.
   */
  private current: Promise<TrackerPollOutcome> | null = null;
  private counted = 0;

  constructor(
    @Inject(TRACKER_POLL_LOCK_DB) private readonly lockDb: Database,
    @Inject(DATABASE) private readonly db: Database,
    private readonly exports: TaskExportsRepository,
    // Источник, а не адаптер: подключение правится на экране и действует
    // без перезапуска, а порт берётся **один раз на тик** (см. `sweep`).
    @Inject(TRACKER_SOURCE) private readonly trackers: TrackerSource,
  ) {}

  /** Сколько тиков было запрошено: по нему виден тик при подъёме. */
  get ticks(): number {
    return this.counted;
  }

  /** Заведён ли цикл: при нулевом интервале его нет вовсе. */
  get hasTimer(): boolean {
    return this.timer !== null;
  }

  /** Нет идущего тика. */
  get isIdle(): boolean {
    return this.current === null;
  }

  onModuleInit(): void {
    const seconds = trackerPollSecondsOf(process.env[TRACKER_POLL_ENV]);

    if (seconds <= 0) {
      // `0` — выключатель цикла целиком: так работают тесты и локальная
      // разработка. Тик при этом не идёт и один раз: выключено значит
      // выключено.
      return;
    }

    this.timer = setInterval(() => {
      // `runAll` уже пишет отказ в лог; фон не оставляет rejected Promise.
      void this.runAll().catch(() => undefined);
    }, seconds * 1000);
    // Процесс не должен жить ради таймера.
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Идущий тик дожидается конца, в отличие от `ffmpeg` у расшифровки:
    // вопрос о доске — короткий `GET`, и оборвать его значило бы оставить
    // половину доски без отметки проверки, то есть сделать её вечно первой
    // в очереди.
    await this.settled();
  }

  /**
   * Прогоняет тик и ждёт его конца.
   *
   * Отдаёт {@link TrackerPollOutcome.Busy}, если тик уже идёт — здесь или в
   * другом экземпляре API.
   */
  async runAll(): Promise<TrackerPollOutcome> {
    if (this.current) {
      return TrackerPollOutcome.Busy;
    }

    return this.claim();
  }

  /** Ждёт конца идущего тика; без тика — возвращается сразу. */
  async settled(): Promise<void> {
    // Отказ тика уже в логе: остановка приложения не должна падать из-за
    // него.
    await this.current?.catch(() => undefined);
  }

  /**
   * Занимает признак тика синхронно и отпускает его в конце.
   *
   * Синхронно — обязательное условие: признак, выставленный после первого
   * `await`, два одновременных запроса обошли бы оба.
   */
  private claim(): Promise<TrackerPollOutcome> {
    this.counted += 1;

    const running = this.locked().finally(() => {
      this.current = null;
    });

    this.current = running;

    return running;
  }

  /**
   * Берёт замок тика и под ним делает работу.
   *
   * Транзакция здесь — держатель замка, а не единица записи: сеансовый
   * `pg_try_advisory_lock` принадлежит соединению, а соединение из пула нам
   * не принадлежит — снимать замок пришлось бы на чужом. Замок уровня
   * транзакции снимается её концом, чем бы тик ни кончился: исключением,
   * падением процесса, обрывом связи. Записи тика идут своими соединениями
   * и этой транзакции не касаются.
   */
  private async locked(): Promise<TrackerPollOutcome> {
    return this.lockDb.transaction(async (tx) => {
      const rows = (await tx.execute(
        sql`select pg_try_advisory_xact_lock(${LOCK_CLASS}, ${LOCK_OBJECT}) as locked`,
      )) as unknown as { locked: boolean }[];

      if (rows[0]?.locked !== true) {
        this.logger.log('Прогон опроса трекера уже идёт: этот пропущен.');

        return TrackerPollOutcome.Busy;
      }

      await this.sweep();

      return TrackerPollOutcome.Done;
    });
  }

  /**
   * Один тик: вопрос о каждой доске, у которой есть что спросить.
   *
   * **Первый отказ обмена останавливает тик**, и это то же решение, что у
   * выгрузки набора: оба кода обмена описывают **канал**, а не строку, и
   * отличить «отказ по этой доске» от «отказ по всем» нечем — тела чужого
   * ответа мы не читаем принципиально (в нём бывает и сам токен). Цена
   * названа и мала: отказавшая доска получает отметку проверки и уходит в
   * конец очереди, поэтому следующий тик начинает с тех, до кого этот не
   * дошёл, — голодания нет, а мёртвый узел не оплачивается десятком пустых
   * походов за тик.
   *
   * Остальным доскам код неудачи **не пишется**: о них не спрашивали, и
   * сказать о них «обмен не удался» значило бы соврать об обмене, которого
   * не было.
   */
  private async sweep(): Promise<void> {
    const targets = await this.exports.listForPoll(MAX_POLLED_PER_TICK);

    if (targets.length === 0) {
      // Настройку не читаем вовсе: спрашивать некого, и поход в базу за
      // подключением был бы работой ради ничего.
      return;
    }

    // Порт — один на тик, а не на доску. Увидь решение о задаче и обмен
    // разные настройки, вопрос ушёл бы на узел, которого в настройке уже
    // нет, а зеркало записалось бы с чужих слов. Цена — один `SELECT` по
    // первичному ключу на тик.
    const tracker = await this.trackers.current();

    if (!tracker.isEnabled) {
      // Та же лестница, что у выгрузки: без токена порт выключен. Доходить
      // до его отказа нельзя — выключенный порт отказал бы кодом обмена, и
      // зеркала всех задач получили бы «обмен не удался» там, где обмена не
      // пробовали.
      this.logger.log('Подключение трекера не настроено: опрос пропущен.');

      return;
    }

    // Сигнал принадлежит тику: обрыв в `finally` не даёт запросу пережить
    // его, а свой предел ожидания ставит адаптер — он один знает, сколько
    // готов ждать этот узел.
    const controller = new AbortController();

    try {
      for (const group of groupsOf(targets)) {
        const asked = await this.ask(tracker, group, controller);

        if (!asked) {
          break;
        }
      }
    } finally {
      controller.abort();
    }
  }

  /**
   * Спрашивает одну доску и пишет исход каждой её задаче.
   *
   * Отдаёт `false`, если обмена не было: тик на этом кончается.
   *
   * Ответ сопоставляется с задачами **по внешнему идентификатору**, и
   * ненайденная задача получает ровно отметку проверки: молчание ответа не
   * означает ни «закрыта», ни «открыта» — её могли унести с доски или
   * удалить в трекере, и выдумывать за молчание нельзя.
   */
  private async ask(
    tracker: Tracker,
    group: TaskExportPollTarget[],
    controller: AbortController,
  ): Promise<boolean> {
    const first = group[0]!;
    let states: TrackerTaskState[];

    try {
      states = await tracker.readTasks(targetOf(first), controller.signal);
    } catch (cause) {
      const code = codeOf(cause);

      this.logger.warn(`Трекер не ответил о доске ${first.boardId}: ${code}`);

      for (const target of group) {
        await this.write(target, { tracker: target.tracker, state: null, code });
      }

      return false;
    }

    const seen = new Map(states.map((state) => [state.externalId, state]));

    for (const target of group) {
      await this.write(target, {
        tracker: target.tracker,
        state: seen.get(target.externalId) ?? null,
        code: null,
      });
    }

    return true;
  }

  /**
   * Пишет исход одной задачи своей транзакцией.
   *
   * Падение записи не прерывает тик — ровно как обход адресов не
   * прерывается падением одного адреса: остальные задачи этой доски уже
   * получили ответ, и терять его из-за одной строки незачем.
   */
  private async write(
    target: TaskExportPollTarget,
    result: TaskPollResult,
  ): Promise<void> {
    try {
      await this.db.transaction((tx) =>
        this.exports.recordPolled(tx, target.taskId, result),
      );
    } catch (cause) {
      this.logger.warn(`Зеркало задачи ${target.taskId} не записано: ${String(cause)}`);
    }
  }
}

/**
 * Задачи, сбитые по доске: один вопрос на доску, а не на задачу.
 *
 * **Ключ — ровно то, что уходит в строку запроса**: проект трекера и доска.
 * Колонки в ключе нет, хотя привязка её знает и `TrackerTarget` несёт, —
 * `readTasks` о колонке не спрашивает вовсе, и ключ с ней разбивал бы одну
 * доску на столько групп, сколько у неё колонок в привязках: два проекта,
 * положенные на общую доску в разные колонки, дали бы тот же `GET` дважды
 * за тик — в API, который считает частоту.
 *
 * Группировать по `projectId` **нашего** проекта нельзя: доска приходит из
 * привязки, и смени привязка доску между строками выборки, вопрос ушёл бы о
 * доске, которой эти задачи уже не принадлежат.
 *
 * Порядок групп — порядок первой задачи в выборке, то есть «кого дольше не
 * спрашивали»: он решает, кто успеет до остановки тика на первом отказе.
 */
function groupsOf(targets: TaskExportPollTarget[]): TaskExportPollTarget[][] {
  const groups = new Map<string, TaskExportPollTarget[]>();

  for (const target of targets) {
    // Ключ собран `JSON.stringify`, а не склейкой через разделитель:
    // идентификаторы приходят от трекера строками, и разделитель, который
    // может встретиться внутри них, слил бы две разные доски в одну.
    const key = JSON.stringify([target.externalProjectId, target.boardId]);
    const group = groups.get(key);

    if (group) {
      group.push(target);
    } else {
      groups.set(key, [target]);
    }
  }

  return [...groups.values()];
}

/**
 * Куда задавать вопрос: привязка проекта, разобранная на три значения.
 *
 * Колонка здесь есть, потому что её требует тип привязки (её спрашивает
 * выгрузка), но в вопрос она не попадает: `readTasks` посылает проект и
 * доску. Поэтому у группы она берётся у первой задачи и ни на что не
 * влияет — а группа ключуется без неё (см. {@link groupsOf}).
 */
function targetOf(target: TaskExportPollTarget): TrackerTarget {
  return {
    externalProjectId: target.externalProjectId,
    boardId: target.boardId,
    boardColumnId: target.boardColumnId,
  };
}

/**
 * Код неудачи обмена.
 *
 * Чужое исключение без своего кода получает «не ответил»: различать его
 * нечем, а в тексте бывает что угодно — и сам токен в сообщении о неверном
 * заголовке. Поэтому в базу идёт код, а не текст.
 */
function codeOf(cause: unknown): string {
  return cause instanceof TrackerFailure ? cause.code : TRACKER_UNAVAILABLE;
}
