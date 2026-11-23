import { TrackerKind, type TrackerConnectionUpdate } from '@cairn/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { CryptoService } from '../crypto/crypto.service';
import { DATABASE } from '../db/db.module';
import type { Database, Executor } from '../db/db.types';
import { subjects, trackerConnections } from '../db/schema';

/**
 * Подключение трекера из базы, вместе с расшифрованным токеном.
 *
 * Наружу не отдаётся ни одной ручкой: проекция для экрана — отдельный тип
 * контракта (`TrackerConnection`), и собирает её служба разрешения. Один
 * тип на оба случая означал бы, что токен попадает в ответ при первой же
 * забытой проекции — тот же приём и та же причина, что у
 * `ModelServiceRecord`.
 */
export interface TrackerConnectionRecord {
  kind: TrackerKind;
  baseUrl: string;
  workspaceId: string | null;
  isEnabled: boolean;
  /** Открытый токен. `null` и когда его нет, и когда он не расшифровался. */
  secret: string | null;
  /** Колонка непуста. Отличает «токена нет» от «токен негоден». */
  hasSecret: boolean;
  /** Токен есть, но расшифровать его нечем: подменён `CAIRN_ENCRYPTION_KEY`. */
  isSecretBroken: boolean;
  updatedAt: Date;
  updatedByLabel: string | null;
}

/**
 * Доступ к подключениям трекера.
 *
 * Субъекта в сигнатуре нет — как у `ModelServicesRepository` и
 * `ServersRepository`, и по той же причине: подключение межпроектно, выдачи
 * на него не бывает, и проверять здесь нечего. Доступ закрыт правом
 * суперадмина на уровне контроллера. `updatedBySubjectId` приходит
 * параметром, потому что это данные, а не проверка.
 *
 * Токен шифруется тем же `CryptoService`, что значения переменных проекта:
 * второго механизма шифрования в системе не появляется.
 */
@Injectable()
export class TrackerConnectionsRepository {
  private readonly logger = new Logger(TrackerConnectionsRepository.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly crypto: CryptoService,
  ) {}

  /** Подключение либо `null`, когда его не заводили. */
  async find(executor: Executor, kind: TrackerKind): Promise<TrackerConnectionRecord | null> {
    const [row] = await this.selectFrom(executor).where(eq(trackerConnections.kind, kind));

    return row ? this.recordOf(row) : null;
  }

  /** Все заведённые подключения. Ненастроенные виды дописывает вызывающий. */
  async findAll(executor: Executor = this.db): Promise<TrackerConnectionRecord[]> {
    const rows = await this.selectFrom(executor).orderBy(asc(trackerConnections.kind));

    return rows.map((row) => this.recordOf(row));
  }

  /**
   * Заводит или правит подключение одним запросом.
   *
   * `ON CONFLICT (kind) DO UPDATE`, а не чтение-правка-запись: иначе две
   * вкладки администратора, сохранённые разом, потеряли бы одну из правок.
   *
   * Колонка токена попадает в `set` **только когда поле `secret` есть во
   * входе**: отсутствие поля означает «не менять», и затирание прежнего
   * токена здесь выглядело бы как «сохранил форму — выключил выгрузку».
   */
  async save(
    executor: Executor,
    kind: TrackerKind,
    updatedBySubjectId: string,
    input: TrackerConnectionUpdate,
  ): Promise<void> {
    const secretEncrypted = this.secretColumnOf(input.secret);
    const fields = {
      baseUrl: input.baseUrl,
      workspaceId: input.workspaceId,
      isEnabled: input.isEnabled,
      updatedBySubjectId,
      // Явно, а не умолчанием колонки: `defaultNow()` действует на
      // вставке, и правка оставила бы на экране дату первой записи.
      updatedAt: new Date(),
    };

    await executor
      .insert(trackerConnections)
      .values({ kind, ...fields, secretEncrypted: secretEncrypted ?? null })
      .onConflictDoUpdate({
        target: trackerConnections.kind,
        set: secretEncrypted === undefined ? fields : { ...fields, secretEncrypted },
      });
  }

  /** Снимает подключение целиком. Отсутствующую строку терпит. */
  async remove(executor: Executor, kind: TrackerKind): Promise<void> {
    await executor.delete(trackerConnections).where(eq(trackerConnections.kind, kind));
  }

  /** Строка подключения вместе с меткой правившего субъекта. */
  private selectFrom(executor: Executor) {
    return executor
      .select({ connection: trackerConnections, updatedByLabel: subjects.label })
      .from(trackerConnections)
      .innerJoin(subjects, eq(subjects.id, trackerConnections.updatedBySubjectId))
      .$dynamic();
  }

  /**
   * Что писать в колонку токена: `undefined` — не трогать её вовсе.
   *
   * Три состояния входа сводятся к трём разным действиям, и промежуточного
   * «пустая строка» среди них нет: его отвергает схема записи.
   */
  private secretColumnOf(secret: string | null | undefined): string | null | undefined {
    if (secret === undefined) {
      return undefined;
    }

    return secret === null ? null : this.crypto.encrypt(secret);
  }

  /**
   * Собирает подключение, расшифровывая токен.
   *
   * Негодный ключ шифрования **не роняет чтение**: подключение считается
   * ненастроенным, и причина называется отдельно
   * (`TRACKER_SECRET_UNDECRYPTABLE`). То же расхождение с
   * `VariablesRepository`, что у узлов модели, и по той же причине: там
   * раскрытие просил человек, здесь настройку читает сам процесс, а экран
   * администрирования — единственное место, с которого это чинится, и
   * ронять его значит отобрать инструмент починки.
   */
  private recordOf(row: {
    connection: typeof trackerConnections.$inferSelect;
    updatedByLabel: string | null;
  }): TrackerConnectionRecord {
    const { connection } = row;
    const hasSecret = connection.secretEncrypted !== null;
    const secret = this.secretOf(connection.secretEncrypted);

    return {
      kind: connection.kind,
      baseUrl: connection.baseUrl,
      workspaceId: connection.workspaceId,
      isEnabled: connection.isEnabled,
      secret,
      hasSecret,
      isSecretBroken: hasSecret && secret === null,
      updatedAt: connection.updatedAt,
      updatedByLabel: row.updatedByLabel,
    };
  }

  /** Открытый токен либо `null`, если расшифровать нечем. */
  private secretOf(encrypted: string | null): string | null {
    if (encrypted === null) {
      return null;
    }

    try {
      return this.crypto.decrypt(encrypted);
    } catch {
      // В лог — предупреждение; в журнал — ничего: чтение настройки не
      // действие субъекта. Причина не пишется: в тексте ошибки
      // расшифровки бывают части шифротекста.
      this.logger.warn('Токен трекера не расшифровывается: проверьте CAIRN_ENCRYPTION_KEY.');

      return null;
    }
  }
}
