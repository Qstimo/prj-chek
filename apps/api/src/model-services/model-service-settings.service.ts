import {
  MODEL_SERVICE_BASE_URL_MISSING,
  MODEL_SERVICE_DISABLED,
  MODEL_SERVICE_SECRET_MISSING,
  MODEL_SERVICE_SECRET_UNDECRYPTABLE,
  ModelAuthScheme,
  ModelServiceKind,
  ModelServicePlacement,
  ModelServiceSource,
  type ModelServiceSettings,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';

import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { hostOf, suggesterSettings } from '../summaries/suggester/settings';
import { ModelServicesRepository, type ModelServiceRecord } from './model-services.repository';

/**
 * Действующая настройка узла вместе с ключом.
 *
 * Наружу не выходит ни одной ручкой: для экрана есть вторая проекция —
 * `ModelServiceSettings` без ключа. Разделение не косметическое: пока тип
 * один, любая новая ручка получает ключ в ответе бесплатно (дизайн, 5.2).
 */
export interface ResolvedModelService {
  kind: ModelServiceKind;
  /** Откуда взята настройка: база, окружение или ниоткуда. */
  source: ModelServiceSource;
  baseUrl: string;
  /** Имя узла из адреса: идёт на экран и в журнал, полный адрес — никуда. */
  host: string | null;
  authScheme: ModelAuthScheme;
  model: string;
  folder: string | null;
  placement: ModelServicePlacement;
  timeoutSeconds: number;
  /** Открытый ключ. `null` и когда его нет, и когда он не расшифровался. */
  secret: string | null;
  hasSecret: boolean;
  /** Решение человека «включено». */
  isEnabled: boolean;
  /** Включено **и** настройка полна: по нему строится адаптер. */
  isOperational: boolean;
  /** Почему узел не работает. Пусто — работает. */
  blockedBy: string | null;
  updatedAt: Date | null;
  updatedByLabel: string | null;
}

/** Настройка узла, прочитанная из окружения, — одна форма на все узлы. */
interface EnvironmentModelService {
  baseUrl: string;
  authScheme: ModelAuthScheme;
  /** Ключ окружения либо `null`: пустая строка ключом не считается. */
  secret: string | null;
  model: string;
  folder: string | null;
  placement: ModelServicePlacement;
  timeoutSeconds: number;
  /** Человек выключил узел переменной вида. */
  isOff: boolean;
}

/**
 * Единственное место, где решается, откуда берётся настройка узла.
 *
 * **Запрет, который нельзя «починить»: сливающей ветки нет ни одной.**
 * Запись в `model_services` есть — вся настройка берётся из неё, включая
 * пустые поля; записи нет — вся настройка берётся из окружения. Третьего
 * не бывает (дизайн, 2.1).
 *
 * Доливать недостающее поле записи значением из окружения запрещено, и
 * особенно ключ: администратор, снявший ключ в форме, чтобы выключить
 * передачу наружу, получил бы работающую передачу, потому что ключ
 * долился из compose. Поле, которое человек очистил намеренно, обязано
 * остаться очищенным. Прямое следствие — **частичная запись выключает
 * узел**, и это не дефект, а то же правило с другой стороны.
 *
 * Кэша нет: один `SELECT` по первичному ключу на обращение. Кэш с TTL дал
 * бы ровно тот дефект, от которого уходит этот дизайн, — «я поменял
 * настройку, а оно ещё минуту работает по-старому» (дизайн, 9.2).
 */
@Injectable()
export class ModelServiceSettingsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: ModelServicesRepository,
  ) {}

  /**
   * Настройка с ключом — для потребителей внутри процесса.
   *
   * Окружение читается только тогда, когда строки нет: выбор источника
   * целиком на узел, и прочитать запасной источник впрок значило бы
   * завести место, откуда он может долиться в запись.
   */
  async resolve(kind: ModelServiceKind): Promise<ResolvedModelService> {
    const record = await this.repository.find(this.db, kind);

    return record ? fromRecord(kind, record) : fromEnvironment(kind, environmentOf(kind));
  }

  /** Проекция для экрана: ключа в ней нет ни одним полем. */
  async settings(kind: ModelServiceKind): Promise<ModelServiceSettings> {
    return settingsOf(await this.resolve(kind));
  }

  /**
   * Настройки всех узлов перечня в его порядке, включая ненастроенные.
   *
   * Ненастроенный узел обязан попасть в список: экран администрирования
   * показывает, что узел существует и не настроен, а пустой список
   * выглядел бы как «настраивать нечего» (дизайн, 5.1).
   */
  async allSettings(): Promise<ModelServiceSettings[]> {
    return Promise.all(Object.values(ModelServiceKind).map((kind) => this.settings(kind)));
  }
}

/** Настройка узла из окружения. Второй узел добавит здесь свою ветку. */
function environmentOf(kind: ModelServiceKind): EnvironmentModelService {
  switch (kind) {
    case ModelServiceKind.TaskSuggester: {
      const settings = suggesterSettings();

      return {
        baseUrl: settings.baseUrl,
        authScheme: settings.authScheme,
        // Пустой ключ — это отсутствие ключа: у колонки базы то же
        // `null`, и два написания одного состояния разошлись бы здесь.
        secret: settings.apiKey === '' ? null : settings.apiKey,
        model: settings.model,
        folder: settings.folder,
        placement: settings.placement,
        timeoutSeconds: settings.timeoutSeconds,
        isOff: settings.isOff,
      };
    }
  }
}

/** Настройка из строки базы: источник `database` и ничего из окружения. */
function fromRecord(kind: ModelServiceKind, record: ModelServiceRecord): ResolvedModelService {
  const blockedBy = blockerOf({
    baseUrl: record.baseUrl,
    authScheme: record.authScheme,
    secret: record.secret,
    isSecretBroken: record.isSecretBroken,
    isEnabled: record.isEnabled,
  });

  return {
    kind,
    source: ModelServiceSource.Database,
    baseUrl: record.baseUrl,
    host: hostOf(record.baseUrl),
    authScheme: record.authScheme,
    model: record.model,
    folder: record.folder,
    placement: record.placement,
    timeoutSeconds: record.timeoutSeconds,
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
 * Настройка из окружения: источник `environment` либо `none`.
 *
 * `none` — когда окружение неполно, а не когда узел выключен: `off` при
 * полной настройке остаётся источником `environment` с причиной
 * «выключено», потому что назвать решение человека неполнотой значило бы
 * послать его искать не то.
 */
function fromEnvironment(
  kind: ModelServiceKind,
  environment: EnvironmentModelService,
): ResolvedModelService {
  // Неполнота считается так, как если бы узел был включён: «чего не
  // хватает» и «выключено вами» — разные ответы, и первый важнее.
  const missing = blockerOf({ ...environment, isSecretBroken: false, isEnabled: true });
  const blockedBy = missing ?? (environment.isOff ? MODEL_SERVICE_DISABLED : null);

  return {
    kind,
    source: missing === null ? ModelServiceSource.Environment : ModelServiceSource.None,
    baseUrl: environment.baseUrl,
    host: hostOf(environment.baseUrl),
    authScheme: environment.authScheme,
    model: environment.model,
    folder: environment.folder,
    placement: environment.placement,
    timeoutSeconds: environment.timeoutSeconds,
    secret: environment.secret,
    hasSecret: environment.secret !== null,
    isEnabled: !environment.isOff,
    isOperational: blockedBy === null,
    blockedBy,
    // Правка `.env` действием субъекта не является: называть автора
    // нечем, и выдумывать системное лицо здесь не за что (дизайн, 9.1).
    updatedAt: null,
    updatedByLabel: null,
  };
}

/**
 * Почему узел не работает, в порядке «сначала чего не хватает».
 *
 * Выключенная галочка называется последней: пока настройка неполна,
 * поставить её обратно всё равно не помогло бы, и сказать об этом прежде
 * недостающего ключа значило бы отправить администратора не туда.
 */
function blockerOf(input: {
  baseUrl: string;
  authScheme: ModelAuthScheme;
  secret: string | null;
  isSecretBroken: boolean;
  isEnabled: boolean;
}): string | null {
  if (input.isSecretBroken) {
    return MODEL_SERVICE_SECRET_UNDECRYPTABLE;
  }

  if (input.baseUrl === '') {
    return MODEL_SERVICE_BASE_URL_MISSING;
  }

  if (input.authScheme !== ModelAuthScheme.None && input.secret === null) {
    return MODEL_SERVICE_SECRET_MISSING;
  }

  return input.isEnabled ? null : MODEL_SERVICE_DISABLED;
}

/**
 * Проекция для экрана, поле за полем.
 *
 * Явным перечислением, а не расширением разрешённой настройки: ключ лежит
 * в ней рядом, и `...resolved` вынес бы его наружу первой же правкой
 * (дизайн, 3.5).
 */
function settingsOf(resolved: ResolvedModelService): ModelServiceSettings {
  return {
    kind: resolved.kind,
    source: resolved.source,
    baseUrl: resolved.baseUrl,
    host: resolved.host,
    authScheme: resolved.authScheme,
    model: resolved.model,
    folder: resolved.folder,
    placement: resolved.placement,
    timeoutSeconds: resolved.timeoutSeconds,
    hasSecret: resolved.hasSecret,
    isEnabled: resolved.isEnabled,
    isOperational: resolved.isOperational,
    blockedBy: resolved.blockedBy,
    updatedAt: resolved.updatedAt?.toISOString() ?? null,
    updatedByLabel: resolved.updatedByLabel,
  };
}
