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
import { AuditService } from '../audit/audit.service';
import { applyTrackerCompletion } from './task-completion';
import {
  TaskExportsRepository,
  type TaskExportPollTarget,
  type TaskPollResult,
} from './task-exports.repository';
import { codeOf, groupsOf, targetOf } from './tracker-poll-groups';
import {
  TRACKER_SOURCE,
  type Tracker,
  type TrackerSource,
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

/** Фоновый опрос под транзакционным замком базы на отдельном соединении.
 * Порт выбирается один раз на тик. Успешный ответ обновляет зеркало и,
 * только при включённом человеком правиле колонки, завершает размещение
 * с системным аудитом в той же транзакции. Тик при старте не запускается.
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
    private readonly audit: AuditService,
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
  private async write(target: TaskExportPollTarget, result: TaskPollResult): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        await applyTrackerCompletion(tx, target, result, this.audit);
        await this.exports.recordPolled(tx, target.taskId, result);
      });
    } catch (cause) {
      this.logger.warn(`Зеркало задачи ${target.taskId} не записано: ${String(cause)}`);
    }
  }
}
