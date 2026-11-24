import {
  AuditSubjectKind,
  ChronicleSource,
  SUGGESTER_DISABLED,
  SUMMARY_TASKS_EMPTY,
  SUMMARY_TEXT_NOT_PLAIN,
  SUMMARY_TEXT_TOO_LONG,
  SummaryTaskOrigin,
  normalizeSummaryText,
  type ProjectMetadata,
  type TaskSuggesterInfo,
  type SummaryRelease,
  type SummaryTaskIds,
  type SummaryReleaseResult,
  type SummaryCreate,
  type SummaryDetail,
  type SummaryListItem,
  type SummaryTasksReplace,
} from '@cairn/shared';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  type OnModuleDestroy,
} from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import {
  SuggesterFailure,
  TASK_SUGGESTER_SOURCE,
  type SuggestResult,
  type TaskSuggester,
  type TaskSuggesterSource,
} from './suggester/task-suggester';
import { RoadmapRepository } from '../roadmap/roadmap.repository';
import { TasksRepository } from '../tasks/tasks.repository';
import { SummariesRepository } from './summaries.repository';
import { RecordingStore } from './transcription/recording-store';

/**
 * Саммари созвонов: транзакции, журнал и вызов порта.
 *
 * Права проверяет репозиторий (ТЗ 4.1), служба добавляет журналирование —
 * как `ChronicleService`. Своё у неё одно: шаг разбивки, который уходит в
 * сеть, и потому ломает обычный порядок «одна транзакция на действие».
 */
@Injectable()
export class SummariesService implements OnModuleDestroy {
  /**
   * Субъекты, чей вызов сейчас в сети.
   *
   * Один одновременный вызов на субъекта: второй запрос, пока первый
   * отвечает, получает отказ. Счётчик живёт в памяти процесса, и это
   * значит прямо следующее — **при нескольких репликах API он перестаёт
   * работать**, каждая реплика считает свои вызовы. Граница названа, а не
   * закрыта: обещать здесь глобальный семафор нечем, а распределённый
   * счётчик пришлось бы завести до того, как установка станет
   * многорепличной (дизайн, раздел 5.4).
   */
  private readonly inFlight = new Set<string>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: SummariesRepository,
    private readonly audit: AuditService,
    @Inject(TASK_SUGGESTER_SOURCE) private readonly suggesters: TaskSuggesterSource,
    private readonly roadmap: RoadmapRepository,
    // Реестр задач: релиз черновика заводит задачи, а не чекпоинты
    // напрямую — формулировка живёт у задачи.
    private readonly tasks: TasksRepository,
    private readonly recordings: RecordingStore,
  ) {}

  /** История по всем проектам, куда можно писать хронику. */
  async overview(subject: RequestSubject): Promise<SummaryListItem[]> {
    return this.repository.findOverview(subject);
  }

  /** Допустимые цели первого шага. */
  async writableProjects(subject: RequestSubject): Promise<ProjectMetadata[]> {
    return this.repository.writableProjects(subject);
  }

  /**
   * Явная проекция не позволяет свойствам адаптера утечь в ответ.
   *
   * Асинхронна, потому что читает действующую настройку, а не снимок
   * старта: подпись над кнопкой отстать от настройки не может
   * (дизайн, 9.1 пункт 2).
   */
  async suggesterInfo(): Promise<TaskSuggesterInfo> {
    const suggester = await this.suggesters.current();

    return {
      isEnabled: suggester.isEnabled, placement: suggester.placement,
      host: suggester.host, model: suggester.model || null,
      maxChars: suggester.maxChars,
    };
  }

  /** История саммари проекта. Чтение в журнал не пишется. */
  async list(subject: RequestSubject, projectId: string): Promise<SummaryListItem[]> {
    return this.repository.findForProject(subject, projectId);
  }

  /** Саммари целиком. */
  async findById(
    subject: RequestSubject,
    projectId: string,
    summaryId: string,
  ): Promise<SummaryDetail> {
    return this.repository.findById(subject, projectId, summaryId);
  }

  /**
   * Создаёт саммари вместе с записью хроники.
   *
   * Текст приводится к пригодному виду **здесь**, а не только в браузере:
   * нормализация одна и та же функция контракта на обеих сторонах (дизайн,
   * 3.1), и проверка живёт в одном месте. Иначе обращение мимо веба
   * сохраняло бы `CRLF` — то есть другую длину у того же текста — а
   * нулевой байт валил бы запрос ошибкой драйвера вместо названного
   * отказа.
   *
   * Две записи журнала в одной транзакции, а не одна: текст ложится в
   * хронику, и запись, появившаяся в ленте без следа в журнале, была бы
   * дыркой — создание идёт репозиторием хроники, а не её службой, и
   * `chronicle_entry.created` писать больше некому. Сам текст в журнал не
   * попадает: только его длина.
   */
  async create(
    subject: RequestSubject,
    projectId: string,
    input: SummaryCreate,
  ): Promise<SummaryDetail> {
    const text = plainTextOf(input.text);

    return this.db.transaction(async (tx) => {
      const created = await this.repository.create(subject, tx, projectId, { ...input, text });

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.ChronicleEntryCreated,
        entityType: 'chronicle_entry',
        entityId: created.chronicleEntryId,
        projectId,
        metadata: {
          title: created.title,
          occurredOn: created.occurredOn,
          source: ChronicleSource.Summary,
        },
      });

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.SummaryCreated,
        entityType: 'summary',
        entityId: created.id,
        projectId,
        metadata: {
          title: created.title,
          occurredOn: created.occurredOn,
          chars: created.text.length,
        },
      });

      return created;
    });
  }

  /**
   * Заменяет черновик задач целиком.
   *
   * В журнал не пишется намеренно: черновик — поверхность до
   * подтверждения, из системы ничего не уходит, а последствие фиксирует
   * запись релиза. Иначе журнал зарос бы строками «правил формулировку»
   * по десятку на саммари, и в нём стало бы не видно того, что произошло.
   */
  async replaceTasks(
    subject: RequestSubject,
    projectId: string,
    summaryId: string,
    input: SummaryTasksReplace,
  ): Promise<SummaryDetail> {
    return this.db.transaction((tx) =>
      this.repository.replaceTasks(subject, tx, projectId, summaryId, input),
    );
  }

  async archiveTasks(subject: RequestSubject, projectId: string, summaryId: string, input: SummaryTaskIds) {
    return this.changeTasks(subject, projectId, summaryId, input, 'archive', AuditAction.SummaryTasksArchived);
  }

  async restoreTasks(subject: RequestSubject, projectId: string, summaryId: string, input: SummaryTaskIds) {
    return this.changeTasks(subject, projectId, summaryId, input, 'restore', AuditAction.SummaryTasksRestored);
  }

  async removeTasks(subject: RequestSubject, projectId: string, summaryId: string, input: SummaryTaskIds) {
    return this.changeTasks(subject, projectId, summaryId, input, 'removeTasks', AuditAction.SummaryTasksDeleted);
  }

  private async changeTasks(
    subject: RequestSubject,
    projectId: string,
    summaryId: string,
    { taskIds }: SummaryTaskIds,
    method: 'archive' | 'restore' | 'removeTasks',
    action: AuditAction,
  ): Promise<SummaryDetail> {
    return this.db.transaction(async (tx) => {
      const detail = await this.repository[method](subject, tx, projectId, summaryId, taskIds);
      await this.audit.record(tx, actorOf(subject), {
        action, entityType: 'summary', entityId: summaryId, projectId,
        metadata: { tasks: new Set(taskIds).size },
      });
      return detail;
    });
  }

  /** Формирует версию и чекпоинты атомарно: половина релиза не сохраняется. */
  async release(
    subject: RequestSubject,
    projectId: string,
    summaryId: string,
    { taskIds, target }: SummaryRelease,
  ): Promise<SummaryReleaseResult> {
    return this.db.transaction(async (tx) => {
      const tasks = await this.repository.tasksForRelease(subject, tx, projectId, summaryId, taskIds);
      if (tasks.length === 0) {
        throw new ConflictException({ code: SUMMARY_TASKS_EMPTY, message: 'Выберите задачи для релиза.' });
      }
      const version = target.kind === 'new'
        ? await this.roadmap.createVersion(subject, tx, projectId, target.version)
        : await this.roadmap.releaseTarget(subject, tx, projectId, target.versionId);
      if (target.kind === 'new') {
        await this.audit.record(tx, actorOf(subject), {
          action: AuditAction.RoadmapVersionCreated, entityType: 'roadmap_version',
          entityId: version.id, projectId, metadata: { label: version.label },
        });
      }
      // Строка черновика становится **задачей реестра**, и только потом
      // её размещением в версии: задача живёт между версиями, а черновик
      // остаётся поверхностью до подтверждения. Порядок — по позиции в
      // черновике, а не по порядку отметок.
      const released: { draftId: string; taskId: string }[] = [];

      for (const task of tasks) {
        const created = await this.tasks.createFromSummary(subject, tx, projectId, summaryId, {
          title: task.title,
          url: task.url,
          platformIds: task.platformIds,
        });
        const checkpoint = await this.roadmap.createCheckpoint(subject, tx, projectId, version.id, {
          taskId: created.id,
        });
        released.push({ draftId: task.id, taskId: created.id });
        await this.audit.record(tx, actorOf(subject), {
          action: AuditAction.CheckpointCreated, entityType: 'checkpoint',
          entityId: checkpoint.id, projectId, metadata: { title: checkpoint.title },
        });
      }
      await this.repository.markReleased(subject, tx, projectId, summaryId, version.id, released);
      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.SummaryReleased, entityType: 'summary', entityId: summaryId, projectId,
        metadata: {
          versionId: version.id,
          label: version.label,
          tasks: tasks.length,
          fromModel: tasks.filter((task) => task.origin === SummaryTaskOrigin.Model).length,
          target: target.kind,
        },
      });
      return { versionId: version.id, label: version.label, checkpointCount: tasks.length };
    });
  }

  /**
   * Удаляет саммари с черновиком. Запись хроники остаётся.
   *
   * Записи созвонов убираются с тома **после** фиксации транзакции
   * (дизайн, 2.5 пункт 4): `unlink` не откатывается, и обратный порядок
   * унёс бы файл у саммари, удаление которого потом откатилось. Своей
   * записи в журнал уборка не получает — человек удалял саммари, и журнал
   * обязан описывать то, что он сделал.
   */
  async remove(subject: RequestSubject, projectId: string, summaryId: string): Promise<void> {
    const { mediaPaths } = await this.db.transaction(async (tx) => {
      const removed = await this.repository.remove(subject, tx, projectId, summaryId);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.SummaryDeleted,
        entityType: 'summary',
        entityId: summaryId,
        projectId,
        metadata: { title: removed.title },
      });

      return removed;
    });

    await this.recordings.removeAll(mediaPaths);
  }

  /**
   * Разбивает текст саммари на задачи через порт.
   *
   * Порядок обязателен и назван: **журнал → сеть → транзакция**.
   *
   * 1. короткой транзакцией — право, принадлежность и текст;
   * 2. порт выключен — `409` **прежде** проверки длины: правильное
   *    действие клиента здесь «попросить администратора включить», а не
   *    «повторить позже» и не «сократить текст». Длиннее предела порта —
   *    отказ `409` с настоящим числом, тоже **до** всякой сети;
   * 3. место в счётчике одновременных вызовов субъекта;
   * 4. **до** вызова, своей короткой транзакцией — запись о передаче:
   *    нет записи — нет и передачи (дизайн, раздел 8.1);
   * 5. вызов **вне транзакции**: держать её открытой шестьдесят секунд,
   *    пока отвечает чужой узел, нельзя — это занятое соединение из пула
   *    и замок на строке;
   * 6. отказ — своя короткая транзакция с записью неудачи и `502`
   *    наружу; прежний черновик при этом не тронут;
   * 7. успех — транзакция замены черновика. Отдельной записи журнала об
   *    успехе нет: запись о передаче уже закрыта, дописать в неё число
   *    предложенных нечем.
   *
   * Адаптер берётся **один раз** в начале вызова и дальше не
   * перечитывается: смена настройки посреди вызова оставила бы в журнале
   * один узел, а текст уехал бы на другой — то есть журнал начал бы
   * врать о передаче, о которой он единственный след (дизайн, 9.3).
   */
  async suggest(
    subject: RequestSubject,
    projectId: string,
    summaryId: string,
  ): Promise<SummaryDetail> {
    const suggester = await this.suggesters.current();
    const source = await this.db.transaction((tx) =>
      this.repository.sourceTextOf(subject, tx, projectId, summaryId),
    );

    // «Не настроено» прежде «длинно» — порядок таблицы дизайна 5.4:
    // предел у выключенного порта свой, и отказ по длине послал бы
    // человека сокращать текст для разбивки, которой нет вовсе.
    if (!suggester.isEnabled) {
      throw new ConflictException({
        code: SUGGESTER_DISABLED,
        message: 'Разбивка не настроена: обратитесь к администратору.',
      });
    }

    if (source.text.length > suggester.maxChars) {
      throw new ConflictException({
        code: SUMMARY_TEXT_TOO_LONG,
        maxChars: suggester.maxChars,
        chars: source.text.length,
        message: `Текст длиннее ${suggester.maxChars} знаков. Сократите или разделите на два саммари.`,
      });
    }

    if (this.inFlight.has(subject.id)) {
      throw new ConflictException(
        'Разбивка уже идёт: дождитесь ответа прежде, чем просить новую.',
      );
    }

    this.inFlight.add(subject.id);

    // Сигнал принадлежит службе: обрыв в `finally` не даёт запросу
    // пережить вызов, а свой предел ожидания ставит адаптер — он один
    // знает, сколько готов ждать этот узел.
    const controller = new AbortController();
    const startedAt = Date.now();

    try {
      await this.db.transaction((tx) =>
        this.audit.record(tx, actorOf(subject), {
          action: AuditAction.SummaryTasksSuggested,
          entityType: 'summary',
          entityId: summaryId,
          projectId,
          metadata: {
            suggester: suggester.placement,
            model: suggester.model,
            host: suggester.host,
            chars: source.text.length,
          },
        }),
      );

      let result: SuggestResult;

      try {
        result = await suggester.suggest(source.text, controller.signal);
      } catch (cause) {
        await this.recordFailure(subject, projectId, summaryId, suggester, {
          cause,
          durationMs: Date.now() - startedAt,
        });

        throw outwardOf(cause);
      }

      return this.db.transaction((tx) =>
        this.repository.replaceWithSuggested(
          subject,
          tx,
          projectId,
          summaryId,
          result.tasks.map((task) => task.title),
          {
            name: suggester.placement,
            model: suggester.model,
            textUpdatedAt: source.textUpdatedAt,
            dropped: result.dropped,
          },
        ),
      );
    } finally {
      controller.abort();
      this.inFlight.delete(subject.id);
    }
  }

  /** Процесс уходит: держать за собой занятые места незачем. */
  onModuleDestroy(): void {
    this.inFlight.clear();
  }

  /**
   * Пишет неудачу вызова: код и длительность, без тела чужого ответа.
   *
   * В теле бывает и присланный нами текст созвона, и подробности о
   * ключе, поэтому наружу идёт только код отказа.
   *
   * Адаптер приходит параметром, а не берётся у источника заново: запись
   * обязана назвать тот узел, на который вызов и ушёл, иначе смена
   * настройки посреди вызова переписала бы историю передачи.
   */
  private async recordFailure(
    subject: RequestSubject,
    projectId: string,
    summaryId: string,
    suggester: TaskSuggester,
    failure: { cause: unknown; durationMs: number },
  ): Promise<void> {
    await this.db.transaction((tx) =>
      this.audit.record(tx, actorOf(subject), {
        action: AuditAction.SummaryTasksSuggestionFailed,
        entityType: 'summary',
        entityId: summaryId,
        projectId,
        metadata: {
          suggester: suggester.placement,
          host: suggester.host,
          code: codeOf(failure.cause),
          durationMs: failure.durationMs,
        },
      }),
    );
  }
}

/**
 * Код отказа порта либо общий «не ответил».
 *
 * Чужое исключение без кода — тоже «не ответил»: его текст в журнал не
 * попадает, а различать нечем.
 */
function codeOf(cause: unknown): string {
  return cause instanceof SuggesterFailure ? cause.code : 'suggester_unavailable';
}

/**
 * Отказ порта в ответ наружу.
 *
 * Выключенный порт — `409` («попросите администратора включить»),
 * остальное — `502` («попробуйте ещё раз»). Сообщение берётся от порта: в
 * нём только код и имя узла, ни ключа, ни чужого тела.
 */
function outwardOf(cause: unknown): Error {
  if (cause instanceof SuggesterFailure && cause.code === SUGGESTER_DISABLED) {
    return new ConflictException({ code: cause.code, message: cause.message });
  }

  return new BadGatewayException({
    code: codeOf(cause),
    message:
      cause instanceof SuggesterFailure
        ? cause.message
        : 'Разбивка не ответила. Попробуйте ещё раз.',
  });
}

/**
 * Текст в пригодном виде либо названный отказ.
 *
 * Функция контракта бросает обычную ошибку с кодом в сообщении — она
 * общая с браузером и о HTTP не знает. Здесь код переезжает в тело
 * ответа: интерфейс разбирает его, а не фразу (`FAILURE_MESSAGES`), и
 * `400` говорит правду — негодно прислано, повторять бессмысленно.
 */
function plainTextOf(raw: string): string {
  try {
    return normalizeSummaryText(raw);
  } catch {
    throw new BadRequestException({
      code: SUMMARY_TEXT_NOT_PLAIN,
      message: 'В тексте управляющие символы: его прислали в непригодном виде.',
    });
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
