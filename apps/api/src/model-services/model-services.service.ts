import {
  MODEL_SERVICE_NOT_CONFIGURED,
  ModelServiceKind,
  ModelServiceSource,
  parseModelServiceBaseUrl,
  type AuditSubjectKind,
  type ModelProbeResult,
  type ModelServiceSettings,
  type ModelServiceUpdate,
} from '@cairn/shared';
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import {
  TASK_SUGGESTER_SOURCE,
  type TaskSuggesterSource,
} from '../summaries/suggester/task-suggester';
import {
  TRANSCRIBER_SOURCE,
  type TranscriberSource,
} from '../summaries/transcription/transcriber';
import { ModelServiceSettingsService } from './model-service-settings.service';
import { ModelServicesRepository } from './model-services.repository';

/**
 * Настройка служб модели: правки вместе с журналированием.
 *
 * Запись в журнал идёт той же транзакцией, что и правка, — как у
 * `ServersService`, и по той же причине: иначе журнал рассказывал бы о
 * правках, которых не случилось. `projectId` у записей пуст: настройка
 * межпроектна и ни одному проекту не принадлежит (дизайн, 11.1).
 *
 * Наружу отдаётся только проекция без ключа: разрешённая настройка с
 * открытым ключом живёт внутри процесса и ни одной ручкой не выходит
 * (дизайн, 5.2).
 */
@Injectable()
export class ModelServicesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: ModelServicesRepository,
    private readonly settings: ModelServiceSettingsService,
    private readonly audit: AuditService,
    @Inject(TASK_SUGGESTER_SOURCE) private readonly suggesters: TaskSuggesterSource,
    @Inject(TRANSCRIBER_SOURCE) private readonly transcribers: TranscriberSource,
  ) {}

  /** Настройки всех узлов перечня, включая ненастроенные. */
  async list(): Promise<ModelServiceSettings[]> {
    return this.settings.allSettings();
  }

  /** Действующая настройка узла. */
  async findByKind(kind: ModelServiceKind): Promise<ModelServiceSettings> {
    return this.settings.settings(kind);
  }

  /**
   * Задаёт настройку узла целиком и возвращает действующую.
   *
   * Адрес разбирается чистой функцией контракта **до** транзакции: отказ
   * по негодному адресу обязан случиться прежде, чем в базе появится
   * строка, которую экран показал бы настроенной. В базу уезжает
   * разобранный адрес, а не присланный, — замыкающая косая снята там же.
   *
   * Ключ — своя запись журнала рядом с правкой полей, в одной транзакции:
   * метаданные на экране журнала не показываются, значит «что произошло»
   * обязано читаться из названия действия (дизайн, 11.2).
   */
  async save(
    subject: RequestSubject,
    kind: ModelServiceKind,
    input: ModelServiceUpdate,
  ): Promise<ModelServiceSettings> {
    const url = parsedUrlOf(input);
    const stored: ModelServiceUpdate = { ...input, baseUrl: url.baseUrl };

    await this.db.transaction(async (tx) => {
      await this.repository.save(tx, kind, subject.id, stored);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.ModelServiceUpdated,
        entityType: 'model_service',
        entityId: kind,
        metadata: {
          host: url.host,
          model: stored.model,
          authScheme: stored.authScheme,
          placement: stored.placement,
          timeoutSeconds: stored.timeoutSeconds,
          isEnabled: stored.isEnabled,
          // Имена полей, но не значения, — правило журнала одно на все
          // сущности (`servers.service.ts:74`). Ключа среди них нет: он
          // своё действие и своя запись.
          fields: Object.keys(stored).filter((field) => field !== 'secret'),
          source: ModelServiceSource.Database,
        },
      });

      if (stored.secret !== undefined) {
        await this.audit.record(tx, actorOf(subject), {
          action: AuditAction.ModelServiceSecretSet,
          entityType: 'model_service',
          entityId: kind,
          metadata: { host: url.host, action: stored.secret === null ? 'cleared' : 'set' },
        });
      }
    });

    return this.settings.settings(kind);
  }

  /**
   * Сбрасывает настройку узла к окружению.
   *
   * Отсутствующую строку терпит и в журнал о ней не пишет: кнопка
   * «Вернуть настройку окружения», нажатая дважды, не должна отказывать
   * там, где желаемое состояние уже достигнуто (дизайн, 5.1). Записи «что
   * было» для этого и нужно читать строку прежде удаления.
   */
  async clear(subject: RequestSubject, kind: ModelServiceKind): Promise<void> {
    await this.db.transaction(async (tx) => {
      const previous = await this.repository.find(tx, kind);

      if (previous === null) {
        return;
      }

      await this.repository.remove(tx, kind);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.ModelServiceCleared,
        entityType: 'model_service',
        entityId: kind,
        metadata: {
          previousHost: hostOf(previous.baseUrl, previous.placement),
          previousModel: previous.model,
        },
      });
    });
  }

  /**
   * Живая проверка связи по сохранённой настройке.
   *
   * Отказ узла — **результат** проверки, а не отказ нашей ручки: наружу
   * уходит `200` с исходом, потому что ручка справилась, когда выяснила,
   * что чужой узел не отвечает (дизайн, 5.1). Отказом остаётся только
   * ненастроенный узел: проверять нечего, и в сеть не идёт ни один байт.
   *
   * Журнал — **после** вызова, с исходом. Отличие от
   * `summary.tasks_suggested` названо: порядок «журнал → сеть» нужен
   * передаче данных проекта, а здесь наружу уходит константа из нашего же
   * исходника, и терять нечего (дизайн, 8.5).
   */
  async probe(subject: RequestSubject, kind: ModelServiceKind): Promise<ModelProbeResult> {
    const settings = await this.settings.settings(kind);

    if (!settings.isOperational) {
      throw new ConflictException({
        code: MODEL_SERVICE_NOT_CONFIGURED,
        message: 'Узел не настроен: проверять связь нечем.',
      });
    }

    const port = await this.sourceOf(kind).current();
    // Сигнал принадлежит службе: обрыв в `finally` не даёт запросу
    // пережить вызов, а свой предел ожидания ставит адаптер.
    const controller = new AbortController();
    let result: ModelProbeResult;

    try {
      result = await port.probe(controller.signal);
    } finally {
      controller.abort();
    }

    await this.db.transaction((tx) =>
      this.audit.record(tx, actorOf(subject), {
        action: AuditAction.ModelServiceProbed,
        entityType: 'model_service',
        entityId: kind,
        metadata: {
          host: result.host,
          model: result.model,
          authScheme: settings.authScheme,
          outcome: result.outcome,
          status: result.status,
          durationMs: result.durationMs,
        },
      }),
    );

    return result;
  }

  /**
   * Порт узла — ветка на узел, а не свой механизм у каждого.
   *
   * Выбор ветвится по значению перечня, а не по провайдеру: ветвление по
   * имени провайдера этот дизайн запрещает целиком (раздел 10.2).
   *
   * Тип возврата — то общее, что ручке проверки и нужно: источник чего-то,
   * что умеет `probe`. Обоим портам она объявлена, и ни одного другого
   * метода администрированию от них не требуется — знать здесь про
   * расшифровку текста или про разбивку задач было бы знанием сверх дела.
   */
  private sourceOf(kind: ModelServiceKind): { current(): Promise<ProbeablePort> } {
    switch (kind) {
      case ModelServiceKind.TaskSuggester:
        return this.suggesters;

      case ModelServiceKind.Transcriber:
        return this.transcribers;
    }
  }
}

/** Порт в той части, которая нужна проверке связи, и ни в какой другой. */
interface ProbeablePort {
  probe(signal: AbortSignal): Promise<ModelProbeResult>;
}

/**
 * Разобранный адрес либо названный отказ.
 *
 * Функция контракта бросает обычную ошибку с кодом в сообщении — она
 * общая с браузером и о HTTP не знает. Здесь код переезжает в тело
 * ответа: интерфейс разбирает код, а не фразу (тот же приём, что
 * `plainTextOf` в `summaries.service.ts`).
 */
function parsedUrlOf(input: ModelServiceUpdate): { baseUrl: string; host: string } {
  try {
    return parseModelServiceBaseUrl(input.baseUrl, input.placement);
  } catch (cause) {
    throw new BadRequestException({
      code: cause instanceof Error ? cause.message : 'model_service_bad_url',
      message: 'Адрес службы негоден: проверьте схему и путь.',
    });
  }
}

/**
 * Имя узла прежнего адреса для записи о сбросе.
 *
 * Через ту же функцию контракта: адрес в базе ею и проверен, и второй
 * разбор разошёлся бы с первым. Негодный адрес (строка из окружения,
 * попавшая в базу до этой проверки) даёт `null`, а не отказ: сброс обязан
 * сработать и на негодной настройке — он её и убирает.
 */
function hostOf(baseUrl: string, placement: ModelServiceUpdate['placement']): string | null {
  try {
    return parseModelServiceBaseUrl(baseUrl, placement).host;
  } catch {
    return null;
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
