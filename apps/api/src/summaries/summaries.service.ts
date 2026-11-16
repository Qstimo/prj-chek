import {
  AuditSubjectKind,
  ChronicleSource,
  SUGGESTER_DISABLED,
  SUMMARY_ALREADY_RELEASED,
  SUMMARY_TEXT_TOO_LONG,
  type SummaryCreate,
  type SummaryDetail,
  type SummaryListItem,
  type SummaryTasksReplace,
} from '@cairn/shared';
import {
  BadGatewayException,
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
  TASK_SUGGESTER,
  type SuggestResult,
  type TaskSuggester,
} from './suggester/task-suggester';
import { SummariesRepository } from './summaries.repository';

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
    @Inject(TASK_SUGGESTER) private readonly suggester: TaskSuggester,
  ) {}

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
    return this.db.transaction(async (tx) => {
      const created = await this.repository.create(subject, tx, projectId, input);

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

  /** Удаляет саммари с черновиком. Запись хроники остаётся. */
  async remove(subject: RequestSubject, projectId: string, summaryId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const removed = await this.repository.remove(subject, tx, projectId, summaryId);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.SummaryDeleted,
        entityType: 'summary',
        entityId: summaryId,
        projectId,
        metadata: { title: removed.title },
      });
    });
  }

  /**
   * Разбивает текст саммари на задачи через порт.
   *
   * Порядок обязателен и назван: **журнал → сеть → транзакция**.
   *
   * 1. короткой транзакцией — право, принадлежность и текст; длиннее
   *    предела порта — отказ `409` с настоящим числом **до** всякой сети;
   * 2. порт выключен — `409`: правильное действие клиента здесь
   *    «попросить администратора включить», а не «повторить позже»;
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
   */
  async suggest(
    subject: RequestSubject,
    projectId: string,
    summaryId: string,
  ): Promise<SummaryDetail> {
    const source = await this.db.transaction((tx) =>
      this.repository.sourceTextOf(subject, tx, projectId, summaryId),
    );

    if (source.isReleased) {
      // Проверка здесь, а не только в замене черновика: узнать о ней
      // после того, как текст ушёл наружу и был оплачен, поздно.
      throw new ConflictException({
        code: SUMMARY_ALREADY_RELEASED,
        message: 'Релиз по этому саммари уже сформирован: задачи правятся в роадмапе.',
      });
    }

    if (source.text.length > this.suggester.maxChars) {
      throw new ConflictException({
        code: SUMMARY_TEXT_TOO_LONG,
        maxChars: this.suggester.maxChars,
        chars: source.text.length,
        message: `Текст длиннее ${this.suggester.maxChars} знаков. Сократите или разделите на два саммари.`,
      });
    }

    if (!this.suggester.isEnabled) {
      throw new ConflictException({
        code: SUGGESTER_DISABLED,
        message: 'Разбивка не настроена: обратитесь к администратору.',
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
            suggester: this.suggester.kind,
            model: this.suggester.model,
            host: this.suggester.host,
            chars: source.text.length,
          },
        }),
      );

      let result: SuggestResult;

      try {
        result = await this.suggester.suggest(source.text, controller.signal);
      } catch (cause) {
        await this.recordFailure(subject, projectId, summaryId, cause, Date.now() - startedAt);

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
            name: this.suggester.kind,
            model: this.suggester.model,
            textUpdatedAt: source.textUpdatedAt,
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
   */
  private async recordFailure(
    subject: RequestSubject,
    projectId: string,
    summaryId: string,
    cause: unknown,
    durationMs: number,
  ): Promise<void> {
    await this.db.transaction((tx) =>
      this.audit.record(tx, actorOf(subject), {
        action: AuditAction.SummaryTasksSuggestionFailed,
        entityType: 'summary',
        entityId: summaryId,
        projectId,
        metadata: {
          suggester: this.suggester.kind,
          host: this.suggester.host,
          code: codeOf(cause),
          durationMs,
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

/** Строит действующее лицо журнала из субъекта запроса. */
function actorOf(subject: RequestSubject): AuditActor {
  return {
    kind: subject.kind as unknown as Exclude<AuditSubjectKind, AuditSubjectKind.System>,
    id: subject.id,
    label: subject.label,
  };
}
