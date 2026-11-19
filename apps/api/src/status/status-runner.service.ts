import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';

import {
  HealthState,
  ObservationGapReason,
  ProjectLifecycle,
  type IncidentProbe,
} from '@cairn/shared';

import type { Database } from '../db/db.types';
import { IncidentsService } from '../incidents/incidents.service';
import { ServersRepository } from '../servers/servers.repository';
import { decideMachine } from '../servers/server-discovery';
import { resolveAddress } from './checkers/address.checker';
import { checkDomainExpiry, type DomainExpiryResult } from './checkers/domain.checker';
import { checkHealth, type HealthResult } from './checkers/health.checker';
import { probeAddress } from './checkers/incident-probe';
import { checkTls } from './checkers/tls.checker';
import { checkUplink } from './checkers/uplink.checker';
import { downPollSecondsOf } from './down-poll';
import { silenceGapOf } from './observation-gap';
import { INCIDENT_NOTIFIER, type IncidentNotifier } from './notifier';
import { recheckDelayMsOf } from './recheck-delay';
import { StatusRepository, type AddressTarget } from './status.repository';

/** Набор проверщиков; в тестах подменяется подделками. */
export interface Checkers {
  checkHealth: typeof checkHealth;
  checkTls: typeof checkTls;
  checkDomainExpiry: typeof checkDomainExpiry;
  resolveAddress: typeof resolveAddress;
  /** Есть ли сеть у нас самих; спрашивается только при падении. */
  checkUplink: typeof checkUplink;
  /** Слепок момента падения; снимается один раз за инцидент. */
  probeAddress: typeof probeAddress;
}

/** Как запускать прогон. */
export interface RunOptions {
  /** Ручной запуск: человек ждёт ответа, и паузы переспроса не будет. */
  isManual?: boolean;
}

/** Чем кончился запрос на прогон. */
export enum StatusRunOutcome {
  /** Прогон состоялся целиком. */
  Done = 'done',
  /** Прогон уже идёт — этот не начался и ничего не изменил. */
  Busy = 'busy',
  /** Прогон принят и идёт в фоне: ответа о его итоге не будет. */
  Accepted = 'accepted',
}

/** Токен внедрения набора проверщиков. */
export const STATUS_CHECKERS = Symbol('STATUS_CHECKERS');

/**
 * Токен соединения, на котором держится замок прогона.
 *
 * Отдельно от рабочего подключения, потому что замок занимает соединение
 * на весь прогон: в боевом пуле (десяток) одного не жалко, а в тестах
 * рабочий пул состоит из единственного соединения — занять его значило бы
 * запереть сам прогон. В развёртывании это тот же пул, что и `DATABASE`.
 */
export const STATUS_RUN_LOCK_DB = Symbol('STATUS_RUN_LOCK_DB');

/**
 * Ключ замка прогона: класс «CAIRN», объект «прогон проверок».
 *
 * Пара чисел, а не одно: так ключ читается глазами и не столкнётся с
 * чужим замком, если он у системы когда-нибудь появится.
 */
const LOCK_CLASS = 0x4341_4952;
const LOCK_OBJECT = 1;

/** Боевой набор проверщиков. */
export const REAL_CHECKERS: Checkers = {
  checkHealth,
  checkTls,
  checkDomainExpiry,
  resolveAddress,
  checkUplink,
  probeAddress,
};

/**
 * Прогон автопроверок (ТЗ 6).
 *
 * Фоновый цикл живёт в процессе API: интервал в минутах берётся из
 * `CAIRN_STATUS_CHECK_INTERVAL_MINUTES` (по умолчанию 15, `0` — выключено:
 * так в тестах и локальной разработке). Фоновые прогоны в журнал действий
 * не пишутся: это не действия субъекта.
 *
 * Первый прогон идёт сразу при подъёме приложения, а не через интервал:
 * иначе после каждого деплоя статус устаревал на четверть часа, а только
 * что вписанный адрес до того же срока оставался «неизвестно».
 *
 * Два прогона одновременно не идут: оба читают открытые инциденты как
 * пустые, и либо второй ловит нарушение частичного уникума, либо
 * успевший получить `up` закрывает только что открытый инцидент ложным
 * «отвечает снова». Замок лежит в базе (`pg_try_advisory_xact_lock`), а
 * не в памяти процесса: в памяти он не защитил бы от второго экземпляра
 * API за прокси.
 */
@Injectable()
export class StatusRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StatusRunnerService.name);
  private timer: NodeJS.Timeout | null = null;
  /** Таймер частого опроса лежащих адресов; живёт только вместе со сводным. */
  private downTimer: NodeJS.Timeout | null = null;
  /**
   * Идущий прогон, если он есть.
   *
   * Память не заменяет замок базы: она сразу отсеивает повторный запрос
   * в том же процессе, пока первый ещё получает соединение и замок.
   */
  private current: Promise<StatusRunOutcome> | null = null;

  constructor(
    @Inject(STATUS_RUN_LOCK_DB) private readonly lockDb: Database,
    private readonly repository: StatusRepository,
    private readonly servers: ServersRepository,
    @Optional() @Inject(STATUS_CHECKERS) private readonly checkers: Checkers = REAL_CHECKERS,
    private readonly incidents: IncidentsService,
    @Optional()
    @Inject(INCIDENT_NOTIFIER)
    private readonly notifier: IncidentNotifier | null = null,
  ) {}

  onModuleInit(): void {
    const minutes = Number(process.env.CAIRN_STATUS_CHECK_INTERVAL_MINUTES ?? '15');

    if (!Number.isFinite(minutes) || minutes <= 0) {
      return;
    }

    // Прогон при старте не держит подъём приложения: оно обязано начать
    // отвечать на запросы, не дожидаясь обхода сети.
    const start = () => {
      // start уже пишет отказ в лог; фон не оставляет rejected Promise.
      void this.start().catch(() => undefined);
    };
    start();

    this.timer = setInterval(start, minutes * 60 * 1000);
    // Процесс не должен жить ради таймера.
    this.timer.unref();

    // Частый опрос лежащих — внутри выключателя сводного прогона: с
    // выключенным циклом (тесты, локальная разработка) в сеть не ходит
    // никто, и второй таймер этого правила нарушать не вправе.
    const seconds = downPollSecondsOf(process.env.CAIRN_STATUS_DOWN_POLL_SECONDS);

    if (seconds > 0) {
      this.downTimer = setInterval(() => {
        void this.pollDown().catch(() => undefined);
      }, seconds * 1000);
      this.downTimer.unref();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
    }

    if (this.downTimer) {
      clearInterval(this.downTimer);
    }

    // Гасимся не посреди прогона: иначе замок снялся бы вместе с
    // соединением, а записи половины адресов не стало бы вовсе.
    await this.settled();
  }

  /**
   * Ждёт только ответа о замке базы; сам обход продолжает в фоне.
   *
   * pg_try_advisory_xact_lock не ждёт чужого прогона: занятый замок
   * сразу даёт Busy, в том числе между разными экземплярами API.
   */
  start(options: RunOptions = {}): Promise<StatusRunOutcome> {
    if (this.current) {
      return Promise.resolve(StatusRunOutcome.Busy);
    }

    return new Promise((resolve, reject) => {
      void this.claim(() => this.sweep(options), resolve).catch((cause) => {
        // До ответа о замке отклоняем запрос; после Accepted только
        // сообщаем об отказе фонового обхода, как и прежде.
        reject(cause);
        this.logger.error(`Прогон проверок упал: ${cause}`);
      });
    });
  }

  /**
   * Прогоняет проверки и ждёт их конца.
   *
   * Отдаёт {@link StatusRunOutcome.Busy}, если прогон уже идёт — здесь
   * или в другом экземпляре API.
   */
  async runAll(options: RunOptions = {}): Promise<StatusRunOutcome> {
    if (this.current) {
      return StatusRunOutcome.Busy;
    }

    return this.claim(() => this.sweep(options));
  }

  /**
   * Переспрашивает адреса с открытым падением — и только их.
   *
   * Под тем же замком, что сводный прогон: оба читают открытые инциденты
   * и пишут их, поэтому разойтись им нельзя — идущий прогон отвечает
   * {@link StatusRunOutcome.Busy}, и этот шаг просто пропускается.
   * Пропустить его не страшно: сводный прогон переспрашивает сам.
   */
  async pollDown(): Promise<StatusRunOutcome> {
    if (this.current) {
      return StatusRunOutcome.Busy;
    }

    return this.claim(() => this.sweepDown());
  }

  /** Ждёт конца идущего прогона; без прогона — возвращается сразу. */
  async settled(): Promise<void> {
    await this.current;
  }

  /**
   * Занимает признак прогона синхронно и отпускает его в конце.
   *
   * Синхронно — обязательное условие: признак, выставленный после первого
   * `await`, два одновременных запроса обошли бы оба.
   */
  private claim(
    run: () => Promise<void>,
    onClaimed?: (outcome: StatusRunOutcome) => void,
  ): Promise<StatusRunOutcome> {
    const running = this.locked(run, onClaimed).finally(() => {
      this.current = null;
    });

    this.current = running;

    return running;
  }

  /**
   * Берёт замок прогона и под ним делает переданную работу.
   *
   * Транзакция здесь — держатель замка, а не единица записи: сеансовый
   * `pg_try_advisory_lock` принадлежит соединению, а соединение из пула
   * нам не принадлежит — снимать замок пришлось бы на чужом. Замок
   * уровня транзакции снимается её концом, чем бы прогон ни кончился:
   * исключением, падением процесса, обрывом связи. Записи прогона идут
   * своими соединениями и этой транзакции не касаются.
   */
  private async locked(
    run: () => Promise<void>,
    onClaimed?: (outcome: StatusRunOutcome) => void,
  ): Promise<StatusRunOutcome> {
    return this.lockDb.transaction(async (tx) => {
      const rows = (await tx.execute(
        sql`select pg_try_advisory_xact_lock(${LOCK_CLASS}, ${LOCK_OBJECT}) as locked`,
      )) as unknown as { locked: boolean }[];

      if (rows[0]?.locked !== true) {
        this.logger.log('Прогон проверок уже идёт: этот пропущен.');
        onClaimed?.(StatusRunOutcome.Busy);

        return StatusRunOutcome.Busy;
      }

      onClaimed?.(StatusRunOutcome.Accepted);
      await run();

      return StatusRunOutcome.Done;
    });
  }

  /**
   * Обходит адреса, переспрашивает упавшие и сводит инциденты.
   *
   * Три фазы вместо одной: проверить, подтвердить, записать. Переспрос
   * нужен затем, что результат проверки теперь не только красит
   * индикатор, но и будит человека, — а цена ложной тревоги много выше
   * цены неверного цвета на четверть часа.
   *
   * Цель одна — адрес: все три проверки идут по одному и тому же имени,
   * и результат ложится одной строкой. Пока проверки шли порознь, они
   * могли описывать разные хосты, попадая в один индикатор.
   *
   * Последовательно: масштаб системы — десятки проектов, и простота
   * важнее скорости (ТЗ 9). Падение одного адреса не прерывает обход.
   */
  private async sweep(options: RunOptions): Promise<void> {
    const startedAt = new Date();
    // До первой записи: собственные записи этого прогона сдвинули бы
    // отметку вперёд, и тишину перед ним стало бы нечем измерить.
    const lastObservedAt = await this.repository.lastObservedAt();
    const targets = await this.repository.listTargets();
    const health = new Map<string, HealthResult>();
    const suspects: AddressTarget[] = [];
    const registryByRoot = new Map<string, DomainExpiryResult>();

    for (const address of targets.addresses) {
      try {
        const result = await this.checkers.checkHealth(address.name, address.healthCheckPath);
        const resolved = await this.checkers.resolveAddress(address.name);
        const tls = await this.checkers.checkTls(address.name);
        const registry = await this.registryOf(address.rootDomain, registryByRoot);

        await this.repository.upsertAddressStatus(address.id, {
          health: result.health,
          latencyMs: result.latencyMs,
          healthError: result.error,
          healthCode: result.code,
          redirectTo: result.redirectTo,
          resolvedIps: resolved.ips,
          resolveError: resolved.error,
          tlsValidTo: tls.validTo,
          tlsTrusted: tls.trusted,
          tlsCode: tls.code,
          tlsError: tls.error,
          registryExpiresAt: registry.expiresAt,
          registryError: registry.error,
        });

        // Сначала база, потом память. Обратный порядок открывал инцидент
        // по падению, запись которого не состоялась: человек на экране
        // видел прежнее состояние, а пуш говорил о новом.
        health.set(address.id, result);

        if (result.health === HealthState.Down) {
          suspects.push(address);
        }
      } catch (cause) {
        this.logger.warn(`Проверка адреса ${address.name} упала: ${cause}`);
      }
    }

    await this.recheck(suspects, health, options.isManual ?? false);
    await this.adoptMachines();

    if (await this.blind(health)) {
      // Пропуск открывается, а не записывается отрезком: слепота длится,
      // и её конец известен только тому прогону, который прозрел.
      await this.openGap(lastObservedAt ?? startedAt, ObservationGapReason.Blind);

      return;
    }

    await this.closeGapOrNoteSilence(lastObservedAt, startedAt);
    // Слепок снимается после ворот по своей сети и до сведения
    // инцидентов: у слепого прогона он описывал бы нашу беду, а не
    // чужую, а после сведения — уже другой момент.
    await this.settleIncidents(
      targets.addresses,
      health,
      await this.probeFalling(targets.addresses, health),
    );
  }

  /**
   * Снимает слепок у адресов, которым инцидент вот-вот откроют.
   *
   * Только у них: у адреса с открытым инцидентом слепок уже есть и
   * относится к моменту падения, а второй описывал бы не тот момент.
   * Приостановленный проект инцидента не открывает — и слепка не стоит.
   *
   * Поэтому проба делается один раз за падение, а не каждый прогон: цена
   * слепка — два соединения, и платить её каждые четверть часа за адрес,
   * о котором всё известно, незачем.
   */
  private async probeFalling(
    addresses: AddressTarget[],
    health: Map<string, HealthResult>,
  ): Promise<Map<string, IncidentProbe>> {
    const falling = addresses.filter(
      (address) =>
        health.get(address.id)?.health === HealthState.Down &&
        address.lifecycle !== ProjectLifecycle.Paused &&
        address.lifecycle !== ProjectLifecycle.Archived,
    );

    if (falling.length === 0) {
      return new Map();
    }

    const open = new Set(await this.incidents.openAddressIds());
    const probes = new Map<string, IncidentProbe>();

    for (const address of falling.filter((address) => !open.has(address.id))) {
      try {
        probes.set(address.id, await this.checkers.probeAddress(address.name, new Date()));
      } catch (cause) {
        // Слепок — подробность, а не вердикт: его отказ не должен стоить
        // инцидента, из-за которого он и снимался.
        this.logger.warn(`Слепок падения адреса ${address.name} не снят: ${cause}`);
      }
    }

    return probes;
  }

  /**
   * Открывает пропуск наблюдения, если открытого ещё нет.
   *
   * Отказ записи не валит прогон и не меняет его решений: пропуск — это
   * отметка о незнании, и потерять её хуже, чем прогон, но не настолько,
   * чтобы ронять обход.
   */
  private async openGap(startedAt: Date, reason: ObservationGapReason): Promise<void> {
    try {
      if (await this.repository.openObservationGap(startedAt, reason)) {
        this.logger.warn(`Наблюдение прервано с ${startedAt.toISOString()}: ${reason}.`);
      }
    } catch (cause) {
      this.logger.warn(`Пропуск наблюдения не записан: ${cause}`);
    }
  }

  /**
   * Закрывает открытый пропуск либо записывает прошедшую тишину.
   *
   * Либо, а не оба: открытый пропуск уже начинался от последнего
   * наблюдения и покрыл всю тишину целиком, включая время, когда процесс
   * не работал, — вторая запись о том же времени задвоила бы счёт
   * ненаблюдавшихся секунд.
   *
   * Тишину видит только прогон, который за ней последовал: пока проверок
   * не было, сказать о них некому. Поэтому она записывается задним
   * числом — отрезком от последнего наблюдения до начала этого прогона.
   */
  private async closeGapOrNoteSilence(
    lastObservedAt: Date | null,
    startedAt: Date,
  ): Promise<void> {
    try {
      if (await this.repository.closeObservationGap(startedAt)) {
        this.logger.log(`Наблюдение возобновлено в ${startedAt.toISOString()}.`);

        return;
      }

      const minutes = Number(process.env.CAIRN_STATUS_CHECK_INTERVAL_MINUTES ?? '15');
      const gap = silenceGapOf(lastObservedAt, startedAt, minutes);

      if (!gap) {
        return;
      }

      await this.repository.recordObservationGap(
        gap.startedAt,
        gap.endedAt,
        ObservationGapReason.Silence,
      );
      this.logger.warn(
        `Пропуск наблюдения: с ${gap.startedAt.toISOString()} до ${gap.endedAt.toISOString()} ` +
          'проверок не было. За это время система не знает ничего.',
      );
    } catch (cause) {
      this.logger.warn(`Пропуск наблюдения не записан: ${cause}`);
    }
  }

  /**
   * Переспрашивает только адреса с открытым падением.
   *
   * Отдельный путь, а не сводный прогон почаще: обходить все адреса раз в
   * минуту значило бы в шестьдесят раз больше запросов ради одного
   * знания — когда лежащий адрес ответит снова. Пока падение открыто, о
   * нём известно всё, кроме этого.
   *
   * Переспрашивается один health: TLS, разрешение имени и срок
   * регистрации за минуту не меняются — то же правило, что у переспроса
   * внутри прогона.
   *
   * Контрольные хосты здесь не спрашиваются: открыть инцидент этот путь
   * не может (у его адресов он уже открыт), а закрыть — только по
   * настоящему ответу адреса, которого при потерянной сети не будет.
   * Остаётся лишь ход падения с причиной, которую правда увидели.
   */
  private async sweepDown(): Promise<void> {
    const falling = new Set(await this.incidents.openAddressIds());

    if (falling.size === 0) {
      return;
    }

    const targets = (await this.repository.listTargets()).addresses.filter((address) =>
      falling.has(address.id),
    );

    if (targets.length === 0) {
      // Инциденты открыты по адресам, которых больше нет среди целей:
      // адрес сняли или проект ушёл в архив. Закроет их сводный прогон —
      // он единственный видит весь список и знает, чего в нём не стало.
      return;
    }

    const health = new Map<string, HealthResult>();

    for (const address of targets) {
      try {
        const result = await this.checkers.checkHealth(address.name, address.healthCheckPath);
        const written = await this.repository.updateAddressHealth(address.id, {
          health: result.health,
          latencyMs: result.latencyMs,
          healthError: result.error,
          healthCode: result.code,
          redirectTo: result.redirectTo,
        });

        if (!written) {
          this.logger.warn(`Статус адреса ${address.name} писать некуда: строки больше нет`);
          continue;
        }

        health.set(address.id, result);
      } catch (cause) {
        this.logger.warn(`Частый опрос адреса ${address.name} упал: ${cause}`);
      }
    }

    await this.settleIncidents(targets, health);
  }

  /**
   * Потеряна ли сеть у нас самих — и значит, судить нам не о чем.
   *
   * Проверки идут из контейнера, и собственная потеря сети выглядит для
   * адресов всех проектов одинаково: «сети до адреса нет». Пуш о падении
   * каждого проекта в эту минуту и ложен, и приходит пачкой, — поэтому
   * прежде, чем сводить инциденты, спрашиваются контрольные хосты.
   *
   * Вопрос задаётся только при падении: установка, у которой всё
   * отвечает, в сеть за этим не ходит вовсе.
   *
   * Слепой прогон не сводит инциденты **никак**: ни открытия, ни
   * закрытия, ни хода падения. Закрытие — такое же утверждение, как
   * открытие. Записи проверок при этом остаются: на экране адрес
   * красный, и причина у него та, которую правда увидели, — скрыто
   * ничего.
   */
  private async blind(health: Map<string, HealthResult>): Promise<boolean> {
    const fallen = [...health.values()].some((result) => result.health === HealthState.Down);

    if (!fallen) {
      return false;
    }

    try {
      const uplink = await this.checkers.checkUplink();

      if (!uplink.isLost) {
        return false;
      }

      this.logger.warn(
        `Контрольные хосты не отвечают (0 из ${uplink.urls}): сеть потеряна у нас, ` +
          'инциденты этого прогона не сводятся.',
      );

      return true;
    } catch (cause) {
      // Отказ самой проверки — не повод замолчать: лучше лишний пуш, чем
      // пропущенное падение.
      this.logger.warn(`Проверка своей сети упала: ${cause}`);

      return false;
    }
  }

  /**
   * Срок регистрации корня: один вопрос реестру на корень за прогон.
   *
   * Реестр знает корень, а не адрес, и у корня один срок на все свои
   * поддомены: три адреса одного домена — это одна оплата. Проверщик
   * помнит ответ и между прогонами, но память прогона нужна и без неё —
   * кэш выключаем настройкой, а правило «один вопрос на корень» от
   * настройки зависеть не должно.
   */
  private async registryOf(
    rootDomain: string,
    asked: Map<string, DomainExpiryResult>,
  ): Promise<DomainExpiryResult> {
    const remembered = asked.get(rootDomain);

    if (remembered) {
      return remembered;
    }

    const answer = await this.checkers.checkDomainExpiry(rootDomain);

    asked.set(rootDomain, answer);

    return answer;
  }

  /**
   * Переспрашивает упавшие адреса после одной общей паузы.
   *
   * Пауза одна на прогон, а не на адрес: десять лежащих адресов не
   * должны растягивать обход на пять минут. Переспрашивается только
   * health — TLS, разрешение имени и срок регистрации за полминуты не
   * меняются и будить человека не повод.
   */
  private async recheck(
    suspects: AddressTarget[],
    health: Map<string, HealthResult>,
    isManual: boolean,
  ): Promise<void> {
    if (suspects.length === 0) {
      return;
    }

    await this.pause(isManual);

    for (const address of suspects) {
      try {
        const result = await this.checkers.checkHealth(address.name, address.healthCheckPath);
        const written = await this.repository.updateAddressHealth(address.id, {
          health: result.health,
          latencyMs: result.latencyMs,
          healthError: result.error,
          healthCode: result.code,
          redirectTo: result.redirectTo,
        });

        if (!written) {
          // Адрес сняли между фазами. Память следует базе: сводить
          // инцидент по вердикту, которого в базе нет, значит обещать
          // человеку экран, на котором ничего не будет.
          this.logger.warn(`Статус адреса ${address.name} писать некуда: строки больше нет`);
          health.delete(address.id);
          continue;
        }

        health.set(address.id, result);
      } catch (cause) {
        // Вердикт первой фазы остаётся в силе: он записан, и экран
        // показывает именно его.
        this.logger.warn(`Переспрос адреса ${address.name} упал: ${cause}`);
      }
    }
  }

  /** Пауза перед переспросом; решение о её длине — в `recheckDelayMsOf`. */
  private async pause(isManual: boolean): Promise<void> {
    const delayMs = recheckDelayMsOf(process.env.CAIRN_HEALTH_RECHECK_DELAY_SECONDS, isManual);

    if (delayMs === 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      // Процесс не должен жить ради паузы — как и ради таймера прогона.
      setTimeout(resolve, delayMs).unref();
    });
  }

  /**
   * Сводит инциденты и отдаёт события на рассылку.
   *
   * По всем адресам, а не только по подозреваемым: инцидент закрывает
   * как раз тот адрес, который ответил и в подозреваемых не был.
   *
   * Сначала запись, потом рассылка: падение процесса между ними теряет
   * пуш, но не теряет инцидент, — а человек увидит падение на экране.
   * Обратный порядок оставил бы уведомление без того, на что в нём
   * нажимают.
   */
  private async settleIncidents(
    addresses: AddressTarget[],
    health: Map<string, HealthResult>,
    probes: Map<string, IncidentProbe> = new Map(),
  ): Promise<void> {
    const events = await this.incidents.reconcile(
      addresses.map((address) => ({
        domainId: address.id,
        name: address.name,
        projectId: address.projectId,
        projectName: address.projectName,
        environmentName: address.environmentName,
        isPaused: address.lifecycle === ProjectLifecycle.Paused,
        // Архивные адреса сюда и не доезжают — их отсекают цели обхода, —
        // но правило об инциденте одно, и обойти его прогон не вправе.
        isArchived: address.lifecycle === ProjectLifecycle.Archived,
        health: health.get(address.id)?.health ?? null,
        healthError: health.get(address.id)?.error ?? null,
        probe: probes.get(address.id) ?? null,
      })),
    );

    if (events.length === 0 || !this.notifier) {
      return;
    }

    try {
      // Отказ рассылки не должен валить прогон: статус важнее уведомления.
      await this.notifier.notify(events);
    } catch (cause) {
      this.logger.warn(`Рассылка уведомлений упала: ${cause}`);
    }
  }

  /**
   * Второй проход: машина окружения по его адресам (спека 3.2–3.4).
   *
   * Отдельно от обхода адресов, потому что решение принимается по
   * окружению целиком: привязка у него одна, а адресов несколько.
   */
  private async adoptMachines(): Promise<void> {
    const targets = await this.repository.listDiscoveryTargets();
    const machinesByIp = await this.servers.machinesByIp();

    for (const target of targets) {
      try {
        const decision = decideMachine({
          environmentName: target.environmentName,
          isBound: target.serverId !== null,
          // Привязанное окружение правило и так оставляет в покое, а
          // предупреждения о расхождении строит чтение статуса: адрес
          // привязанной машины прогону не нужен.
          boundIp: null,
          addresses: target.addresses,
          machinesByIp,
        });

        this.warnAboutDuplicates(target.addresses, machinesByIp);

        if (decision.createIp) {
          const created = await this.servers.createDiscovered(decision.createIp);

          machinesByIp.set(decision.createIp, [{ id: created.id }]);
          await this.servers.bindEnvironment(target.environmentId, created.id);
          continue;
        }

        if (decision.bindServerId) {
          await this.servers.bindEnvironment(target.environmentId, decision.bindServerId);
        }
      } catch (cause) {
        this.logger.warn(`Машина окружения ${target.environmentName} не определилась: ${cause}`);
      }
    }
  }

  /**
   * Сообщает оператору о дубле в реестре.
   *
   * В лог, а не предупреждением статуса: две машины с одним адресом —
   * беспорядок реестра, а не состояние чужого проекта.
   */
  private warnAboutDuplicates(
    addresses: { resolvedIps: string[] }[],
    machinesByIp: Map<string, { id: string }[]>,
  ): void {
    const duplicated = addresses
      .flatMap((address) => address.resolvedIps)
      .find((ip) => (machinesByIp.get(ip) ?? []).length > 1);

    if (duplicated) {
      this.logger.warn(`В реестре две машины с адресом ${duplicated}`);
    }
  }
}
