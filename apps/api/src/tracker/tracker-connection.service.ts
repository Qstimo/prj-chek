import {
  TRACKER_BASE_URL_MISSING,
  TRACKER_DISABLED,
  TRACKER_SECRET_MISSING,
  TRACKER_SECRET_UNDECRYPTABLE,
  TrackerKind,
  type TrackerConnection,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';

import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { hostOf } from '../summaries/suggester/settings';
import {
  TrackerConnectionsRepository,
  type TrackerConnectionRecord,
} from './tracker-connections.repository';

/**
 * Действующее подключение вместе с токеном.
 *
 * Наружу не выходит ни одной ручкой: для экрана есть вторая проекция —
 * `TrackerConnection` без токена. Разделение не косметическое: пока тип
 * один, любая новая ручка получает токен в ответе бесплатно.
 */
export interface ResolvedTrackerConnection {
  kind: TrackerKind;
  baseUrl: string;
  /** Имя узла из адреса: идёт в журнал и в отказ, полный адрес — никуда. */
  host: string | null;
  workspaceId: string | null;
  /** Открытый токен. `null` и когда его нет, и когда он не расшифровался. */
  secret: string | null;
  hasSecret: boolean;
  /** Решение человека «включено». */
  isEnabled: boolean;
  /** Включено **и** настройка полна: по нему строится адаптер. */
  isOperational: boolean;
  /** Почему трекер не работает. Пусто — работает. */
  blockedBy: string | null;
  updatedAt: Date | null;
  updatedByLabel: string | null;
}

/**
 * Единственное место, где читается настройка подключения трекера.
 *
 * **Запасного источника в окружении нет, и это решение, а не недоделка**
 * (дизайн, 3.4). У узлов модели окружение осталось потому, что по прежнему
 * README собраны работающие установки; подключения трекера не было никогда,
 * собранных по нему установок не существует, и второй источник пришлось бы
 * поддерживать ради пустого множества. Поэтому здесь нет ни `source`, ни
 * ветки «долить из переменных»: есть строка — настройка из неё, нет строки
 * — трекер не настроен.
 *
 * Кэша нет: один `SELECT` по первичному ключу на обращение. Кэш с TTL дал
 * бы ровно тот дефект, от которого уходит этот дизайн, — «я поменял
 * настройку, а оно ещё минуту работает по-старому».
 */
@Injectable()
export class TrackerConnectionService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: TrackerConnectionsRepository,
  ) {}

  /** Настройка с токеном — для потребителей внутри процесса. */
  async resolve(kind: TrackerKind): Promise<ResolvedTrackerConnection> {
    const record = await this.repository.find(this.db, kind);

    return record ? resolvedOf(kind, record) : unconfigured(kind);
  }

  /** Проекция для экрана: токена в ней нет ни одним полем. */
  async connection(kind: TrackerKind): Promise<TrackerConnection> {
    return connectionOf(await this.resolve(kind));
  }

  /**
   * Подключения всех видов перечня, включая ненастроенные.
   *
   * Ненастроенный вид обязан попасть в список: экран администрирования
   * показывает, что трекер поддерживается и не настроен, а пустой список
   * выглядел бы как «настраивать нечего».
   */
  async allConnections(): Promise<TrackerConnection[]> {
    return Promise.all(Object.values(TrackerKind).map((kind) => this.connection(kind)));
  }
}

/** Настройка из строки базы. */
function resolvedOf(
  kind: TrackerKind,
  record: TrackerConnectionRecord,
): ResolvedTrackerConnection {
  const blockedBy = blockerOf(record);

  return {
    kind,
    baseUrl: record.baseUrl,
    host: hostOf(record.baseUrl),
    workspaceId: record.workspaceId,
    secret: record.secret,
    hasSecret: record.hasSecret,
    isEnabled: record.isEnabled,
    isOperational: blockedBy === null,
    blockedBy,
    updatedAt: record.updatedAt,
    updatedByLabel: record.updatedByLabel,
  };
}

/**
 * Подключения нет вовсе.
 *
 * Пустой адрес и `base_url_missing`, а не отдельное состояние «строки нет»:
 * экрану нужно показать форму, а форме — пустые поля, и второе написание
 * того же состояния разошлось бы с первым. `isEnabled: true` при этом
 * означает «галочку никто не снимал»: сказать «выключено» о ненастроенном
 * трекере значило бы отправить человека ставить галочку вместо адреса.
 */
function unconfigured(kind: TrackerKind): ResolvedTrackerConnection {
  return {
    kind,
    baseUrl: '',
    host: null,
    workspaceId: null,
    secret: null,
    hasSecret: false,
    isEnabled: true,
    isOperational: false,
    blockedBy: TRACKER_BASE_URL_MISSING,
    updatedAt: null,
    updatedByLabel: null,
  };
}

/**
 * Почему трекер не работает, в порядке «сначала чего не хватает».
 *
 * Выключенная галочка называется последней: пока настройка неполна,
 * поставить её обратно всё равно не помогло бы, и сказать об этом прежде
 * недостающего токена значило бы отправить администратора не туда.
 */
function blockerOf(record: TrackerConnectionRecord): string | null {
  if (record.isSecretBroken) {
    return TRACKER_SECRET_UNDECRYPTABLE;
  }

  if (record.baseUrl === '') {
    return TRACKER_BASE_URL_MISSING;
  }

  if (record.secret === null) {
    return TRACKER_SECRET_MISSING;
  }

  return record.isEnabled ? null : TRACKER_DISABLED;
}

/**
 * Проекция для экрана, поле за полем.
 *
 * Явным перечислением, а не расширением разрешённой настройки: токен лежит
 * в ней рядом, и `...resolved` вынес бы его наружу первой же правкой.
 */
function connectionOf(resolved: ResolvedTrackerConnection): TrackerConnection {
  return {
    kind: resolved.kind,
    baseUrl: resolved.baseUrl,
    workspaceId: resolved.workspaceId,
    hasSecret: resolved.hasSecret,
    isEnabled: resolved.isEnabled,
    isOperational: resolved.isOperational,
    blockedBy: resolved.blockedBy,
    updatedAt: resolved.updatedAt?.toISOString() ?? null,
    updatedByLabel: resolved.updatedByLabel,
  };
}
