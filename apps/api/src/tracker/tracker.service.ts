import {
  parseTrackerBaseUrl,
  TRACKER_NOT_CONFIGURED,
  TRACKER_UNAVAILABLE,
  TrackerKind,
  type AuditSubjectKind,
  type ProjectTracker,
  type TrackerBinding,
  type TrackerBindingUpdate,
  type TrackerConnection,
  type TrackerConnectionUpdate,
  type TrackerProbeResult,
  type TrackerTargets,
} from '@cairn/shared';
import { BadGatewayException, Inject, Injectable } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { hostOf } from '../summaries/suggester/settings';
import { TaskExportsRepository } from './task-exports.repository';
import { TrackerBindingsRepository } from './tracker-bindings.repository';
import { TrackerConnectionService } from './tracker-connection.service';
import { TrackerConnectionsRepository } from './tracker-connections.repository';
import { TRACKER_SOURCE, TrackerFailure, type TrackerSource } from './tracker';
import { TrackerBadUrlError, TrackerNotConfiguredError } from './tracker.errors';

/**
 * Подключение трекера и привязка проекта: правки вместе с журналированием.
 *
 * Запись в журнал идёт той же транзакцией, что и правка, — как у серверов и
 * узлов модели, и по той же причине: иначе журнал рассказывал бы о правках,
 * которых не случилось. `projectId` у записей подключения пуст — настройка
 * межпроектна; у записи привязки он назван — привязка принадлежит проекту.
 *
 * Наружу отдаётся только проекция без токена: разрешённое подключение с
 * открытым токеном живёт внутри процесса и ни одной ручкой не выходит.
 *
 * **Четыре действия журнала, а не пять** (дизайн, 7): снятие подключения —
 * это его правка, и отличается она значением `action` в метаданных, а не
 * новым именем в перечне. У узлов модели пятое действие есть, но там оно
 * означает другое событие — «настройка вернулась к окружению», — а у
 * трекера возвращаться некуда.
 */
@Injectable()
export class TrackerService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: TrackerConnectionsRepository,
    private readonly bindings: TrackerBindingsRepository,
    // Зеркала выгрузок — чтобы снятие подключения уносило их одной
    // транзакцией с ним (дизайн, 3.3): пережившая настройку строка
    // утверждала бы, что в чужом трекере лежит наша задача.
    private readonly exports: TaskExportsRepository,
    private readonly connections: TrackerConnectionService,
    private readonly audit: AuditService,
    @Inject(TRACKER_SOURCE) private readonly trackers: TrackerSource,
  ) {}

  /** Подключения всех видов перечня, включая ненастроенные. */
  async list(): Promise<TrackerConnection[]> {
    return this.connections.allConnections();
  }

  /** Действующее подключение вида. */
  async find(kind: TrackerKind): Promise<TrackerConnection> {
    return this.connections.connection(kind);
  }

  /**
   * Задаёт подключение целиком и возвращает действующее.
   *
   * Адрес разбирается чистой функцией контракта **до** транзакции: отказ по
   * негодному адресу обязан случиться прежде, чем в базе появится строка,
   * которую экран показал бы настроенной. В базу уезжает разобранный адрес,
   * а не присланный, — замыкающая косая снята там же.
   *
   * Токен — своя запись журнала рядом с правкой полей, в одной транзакции:
   * метаданные на экране журнала не показываются, значит «что произошло»
   * обязано читаться из названия действия.
   */
  async save(
    subject: RequestSubject,
    kind: TrackerKind,
    input: TrackerConnectionUpdate,
  ): Promise<TrackerConnection> {
    const baseUrl = parsedUrlOf(input.baseUrl);
    const stored: TrackerConnectionUpdate = { ...input, baseUrl };

    await this.db.transaction(async (tx) => {
      await this.repository.save(tx, kind, subject.id, stored);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.TrackerConnectionUpdated,
        entityType: 'tracker_connection',
        entityId: kind,
        metadata: {
          host: hostOf(baseUrl),
          workspaceId: stored.workspaceId,
          isEnabled: stored.isEnabled,
          // Имена полей, но не значения, — правило журнала одно на все
          // сущности. Токен среди них есть **именем**: он своё действие и
          // своя запись, а имя поля говорит лишь «его трогали».
          fields: Object.keys(stored),
          action: 'saved',
        },
      });

      if (stored.secret !== undefined) {
        await this.audit.record(tx, actorOf(subject), {
          action: AuditAction.TrackerSecretSet,
          entityType: 'tracker_connection',
          entityId: kind,
          metadata: {
            host: hostOf(baseUrl),
            action: stored.secret === null ? 'cleared' : 'set',
          },
        });
      }
    });

    return this.connections.connection(kind);
  }

  /**
   * Снимает подключение целиком.
   *
   * Отсутствующую строку терпит и в журнал о ней не пишет: кнопка «Снять
   * подключение», нажатая дважды, не должна отказывать там, где желаемое
   * состояние уже достигнуто. Записи «что было» для этого и нужно читать
   * строку прежде удаления.
   */
  async clear(subject: RequestSubject, kind: TrackerKind): Promise<void> {
    await this.db.transaction(async (tx) => {
      const previous = await this.repository.find(tx, kind);

      if (previous === null) {
        return;
      }

      // Зеркала и привязки уносятся **одной транзакцией** с подключением, и
      // порядок внутри неё не важен, а неделимость важна: подключение без
      // зеркал — рабочее состояние («выгрузок не было»), а зеркала без
      // подключения — ложь о том, что в чужом трекере лежит наша задача с
      // известным идентификатором. Причины каждого шага — у самих методов.
      await this.exports.removeForTracker(tx, kind);
      await this.bindings.removeForTracker(tx, kind);
      await this.repository.remove(tx, kind);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.TrackerConnectionUpdated,
        entityType: 'tracker_connection',
        entityId: kind,
        metadata: { host: hostOf(previous.baseUrl), action: 'cleared' },
      });
    });
  }

  /**
   * Живая проверка связи по сохранённому подключению.
   *
   * Отказ трекера — **результат** проверки, а не отказ нашей ручки: наружу
   * уходит `200` с исходом, потому что ручка справилась, когда выяснила,
   * что чужой узел не отвечает. Отказом остаётся только ненастроенное
   * подключение: проверять нечего, и в сеть не идёт ни один байт.
   *
   * Журнал — **после** вызова, с исходом. Отличие от правила «запись до
   * передачи» названо: тот порядок нужен передаче данных проекта, а здесь
   * наружу не уходит ни байта содержимого — проверка только читает чужое
   * пространство.
   */
  async probe(subject: RequestSubject, kind: TrackerKind): Promise<TrackerProbeResult> {
    const connection = await this.connections.connection(kind);

    if (!connection.isOperational) {
      throw new TrackerNotConfiguredError();
    }

    const port = await this.trackers.current();
    // Сигнал принадлежит службе: обрыв в `finally` не даёт запросу
    // пережить вызов, а свой предел ожидания ставит адаптер.
    const controller = new AbortController();
    let result: TrackerProbeResult;

    try {
      result = await port.probe(controller.signal);
    } finally {
      controller.abort();
    }

    await this.db.transaction((tx) =>
      this.audit.record(tx, actorOf(subject), {
        action: AuditAction.TrackerProbed,
        entityType: 'tracker_connection',
        entityId: kind,
        metadata: {
          host: result.host,
          outcome: result.outcome,
          status: result.status,
          durationMs: result.durationMs,
        },
      }),
    );

    return result;
  }

  /**
   * Трекер со стороны проекта: готовность и привязка.
   *
   * Адреса, имени узла и состояния токена здесь нет: подрядчику нужен
   * ответ на «можно ли выгружать», а настройка установки принадлежит
   * `/settings` и суперадмину.
   */
  async findForProject(subject: RequestSubject, projectId: string): Promise<ProjectTracker> {
    const binding = await this.bindings.findForProject(subject, projectId);
    const connection = await this.connections.connection(TrackerKind.Weeek);

    return {
      hasConnection: connection.hasSecret,
      isOperational: connection.isOperational,
      blockedBy: connection.blockedBy,
      binding,
    };
  }

  /**
   * Ставит привязку проекта и возвращает её целиком.
   *
   * Настроенного подключения **не требует**, и это решение: привязка — три
   * строки, и запретить её правку из-за снятой администратором галочки
   * значило бы потерять выбор доски вместе с выключением выгрузки.
   * Идентификаторы при этом почти всегда приходят из `targets`, которая
   * подключение требует, — то есть вручную тут набирают редко.
   */
  async saveBinding(
    subject: RequestSubject,
    projectId: string,
    input: TrackerBindingUpdate,
  ): Promise<TrackerBinding> {
    return this.db.transaction(async (tx) => {
      await this.bindings.save(subject, tx, projectId, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.TrackerBindingSet,
        entityType: 'tracker_binding',
        entityId: projectId,
        projectId,
        // Значения названы целиком, в отличие от правки формулировки:
        // идентификаторы чужой доски содержимым проекта не являются, а на
        // вопрос «куда уехали наши задачи в прошлом месяце» отвечать
        // больше нечем — привязка хранит только последнее состояние.
        metadata: {
          tracker: TrackerKind.Weeek,
          externalProjectId: input.externalProjectId,
          boardId: input.boardId,
          boardColumnId: input.boardColumnId,
          completionColumnId: input.completionColumnId ?? null,
        },
      });

      return (await this.bindings.findForProject(subject, projectId, tx))!;
    });
  }

  /**
   * Живые списки трекера для выбора доски.
   *
   * Через нашу ручку, а не прямым запросом из браузера: токен не покидает
   * сервер (дизайн, 9.3). Порядок внутри строгий и не переставляется:
   * **сначала право, потом подключение, и только потом сеть** — обратный
   * порядок позволил бы кому угодно дёргать чужой API нашим токеном и
   * заодно выяснять по коду ответа, настроен ли у нас трекер.
   *
   * Журнала у этой операции нет: наружу не уходит ни байта содержимого
   * проекта — только наш токен в заголовке, — а записывать каждое открытие
   * панели значило бы залить журнал тем, что ни на один вопрос не отвечает.
   */
  async targets(subject: RequestSubject, projectId: string): Promise<TrackerTargets> {
    await this.bindings.requireWrite(subject, projectId);

    const connection = await this.connections.connection(TrackerKind.Weeek);

    if (!connection.isOperational) {
      throw new TrackerNotConfiguredError();
    }

    const port = await this.trackers.current();
    const controller = new AbortController();

    try {
      return await port.targets(controller.signal);
    } catch (cause) {
      throw outwardOf(cause);
    } finally {
      controller.abort();
    }
  }
}

/**
 * Отказ порта в ответ наружу.
 *
 * Выключенный порт — `409` («попросите администратора»), остальное — `502`
 * («трекер не ответил или отказал»). Тот же приём и те же коды, что у
 * предложителя задач (`summaries.service.ts`): `500` сказал бы, что
 * сломались мы, а сломался обмен с чужой системой.
 *
 * Сообщение берётся от порта: в нём только причина и имя узла — ни токена,
 * ни чужого тела. Чужое исключение без кода своего текста наружу не
 * получает вовсе: различать его нечем, а в тексте бывает что угодно.
 */
function outwardOf(cause: unknown): Error {
  if (cause instanceof TrackerFailure && cause.code === TRACKER_NOT_CONFIGURED) {
    return new TrackerNotConfiguredError();
  }

  return new BadGatewayException({
    code: cause instanceof TrackerFailure ? cause.code : TRACKER_UNAVAILABLE,
    message:
      cause instanceof TrackerFailure ? cause.message : 'Трекер не ответил. Попробуйте ещё раз.',
  });
}

/**
 * Разобранный адрес либо названный отказ.
 *
 * Функция контракта бросает обычную ошибку с кодом в сообщении — она общая
 * с браузером и о HTTP не знает. Здесь код переезжает в тело ответа:
 * интерфейс разбирает код, а не фразу.
 */
function parsedUrlOf(baseUrl: string): string {
  try {
    return parseTrackerBaseUrl(baseUrl);
  } catch {
    throw new TrackerBadUrlError();
  }
}

/** Строит действующее лицо журнала из субъекта запроса. */
function actorOf(subject: RequestSubject): AuditActor {
  return {
    kind: subject.kind as unknown as Exclude<AuditSubjectKind, AuditSubjectKind.System>,
    id: subject.id,
    label: subject.label,
  };
}
