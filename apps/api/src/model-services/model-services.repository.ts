import { type ModelServiceKind, type ModelServiceUpdate } from '@cairn/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { CryptoService } from '../crypto/crypto.service';
import { DATABASE } from '../db/db.module';
import type { Database, Executor } from '../db/db.types';
import { modelServices, subjects } from '../db/schema';

/**
 * Настройка узла из базы, вместе с расшифрованным ключом.
 *
 * Наружу не отдаётся ни одной ручкой: проекция для экрана — отдельный тип
 * контракта (`ModelServiceSettings`), и собирает её служба разрешения.
 * Один тип на оба случая означал бы, что ключ попадает в ответ при первой
 * же забытой проекции (дизайн, 5.2).
 */
export interface ModelServiceRecord {
  kind: ModelServiceKind;
  baseUrl: string;
  authScheme: (typeof modelServices.authScheme)['_']['data'];
  model: string;
  folder: string | null;
  placement: (typeof modelServices.placement)['_']['data'];
  timeoutSeconds: number;
  isEnabled: boolean;
  /** Открытый ключ. `null` и когда его нет, и когда он не расшифровался. */
  secret: string | null;
  /** Колонка непуста. Отличает «ключа нет» от «ключ негоден». */
  hasSecret: boolean;
  /** Ключ есть, но расшифровать его нечем: подменён `CAIRN_ENCRYPTION_KEY`. */
  isSecretBroken: boolean;
  updatedAt: Date;
  updatedByLabel: string | null;
}

/**
 * Доступ к настройкам служб модели.
 *
 * Субъекта в сигнатуре нет — как и у `ServersRepository`, и по той же
 * причине: настройка межпроектна, выдачи на неё не бывает, и проверять
 * здесь нечего. Доступ закрыт правом суперадмина на уровне контроллера.
 * `updatedBySubjectId` приходит параметром, потому что это данные, а не
 * проверка.
 *
 * Единственное место, где ключ службы шифруется и расшифровывается, и тем
 * же `CryptoService`, что значения переменных: второго механизма
 * шифрования в системе не появляется (дизайн, 3.3).
 */
@Injectable()
export class ModelServicesRepository {
  private readonly logger = new Logger(ModelServicesRepository.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly crypto: CryptoService,
  ) {}

  /** Настройка узла либо `null`, когда её не заводили. */
  async find(executor: Executor, kind: ModelServiceKind): Promise<ModelServiceRecord | null> {
    const [row] = await this.selectFrom(executor).where(eq(modelServices.kind, kind));

    return row ? this.recordOf(row) : null;
  }

  /** Все заведённые настройки. Ненастроенные узлы дописывает вызывающий. */
  async findAll(executor: Executor = this.db): Promise<ModelServiceRecord[]> {
    const rows = await this.selectFrom(executor).orderBy(asc(modelServices.kind));

    return rows.map((row) => this.recordOf(row));
  }

  /**
   * Заводит или правит настройку узла одним запросом.
   *
   * `ON CONFLICT (kind) DO UPDATE`, а не чтение-правка-запись: иначе две
   * вкладки администратора, сохранённые разом, потеряли бы одну из правок
   * (дизайн, 3.2).
   *
   * Колонка ключа попадает в `set` **только когда поле `secret` есть во
   * входе**: отсутствие поля означает «не менять», и затирание прежнего
   * ключа здесь выглядело бы как «сохранил форму — выключил узел».
   */
  async save(
    executor: Executor,
    kind: ModelServiceKind,
    updatedBySubjectId: string,
    input: ModelServiceUpdate,
  ): Promise<void> {
    const secretEncrypted = this.secretColumnOf(input.secret);
    const fields = {
      baseUrl: input.baseUrl,
      authScheme: input.authScheme,
      model: input.model,
      folder: input.folder,
      placement: input.placement,
      timeoutSeconds: input.timeoutSeconds,
      isEnabled: input.isEnabled,
      updatedBySubjectId,
      // Явно, а не умолчанием колонки: `defaultNow()` действует на
      // вставке, и правка оставила бы на экране дату первой записи.
      updatedAt: new Date(),
    };

    await executor
      .insert(modelServices)
      .values({ kind, ...fields, secretEncrypted: secretEncrypted ?? null })
      .onConflictDoUpdate({
        target: modelServices.kind,
        set: secretEncrypted === undefined ? fields : { ...fields, secretEncrypted },
      });
  }

  /** Сбрасывает настройку к окружению. Отсутствующую строку терпит. */
  async remove(executor: Executor, kind: ModelServiceKind): Promise<void> {
    await executor.delete(modelServices).where(eq(modelServices.kind, kind));
  }

  /** Строка настройки вместе с меткой правившего субъекта. */
  private selectFrom(executor: Executor) {
    return executor
      .select({ service: modelServices, updatedByLabel: subjects.label })
      .from(modelServices)
      .innerJoin(subjects, eq(subjects.id, modelServices.updatedBySubjectId))
      .$dynamic();
  }

  /**
   * Что писать в колонку ключа: `undefined` — не трогать её вовсе.
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
   * Собирает настройку, расшифровывая ключ.
   *
   * Негодный ключ шифрования **не роняет чтение**: узел считается
   * ненастроенным, и причина называется отдельно. Расхождение с
   * `VariablesRepository`, где исключение летит наверх, названо в дизайне
   * (3.7): там раскрытие просил человек и молча вернуть мусор было бы
   * опаснее отказа, здесь настройку читает сам процесс, а экран
   * администрирования — единственное место, с которого это чинится, и
   * ронять его значит отобрать инструмент починки.
   */
  private recordOf(row: {
    service: typeof modelServices.$inferSelect;
    updatedByLabel: string | null;
  }): ModelServiceRecord {
    const { service } = row;
    const hasSecret = service.secretEncrypted !== null;
    const secret = this.secretOf(service.secretEncrypted);

    return {
      kind: service.kind,
      baseUrl: service.baseUrl,
      authScheme: service.authScheme,
      model: service.model,
      folder: service.folder,
      placement: service.placement,
      timeoutSeconds: service.timeoutSeconds,
      isEnabled: service.isEnabled,
      secret,
      hasSecret,
      isSecretBroken: hasSecret && secret === null,
      updatedAt: service.updatedAt,
      updatedByLabel: row.updatedByLabel,
    };
  }

  /** Открытый ключ либо `null`, если расшифровать нечем. */
  private secretOf(encrypted: string | null): string | null {
    if (encrypted === null) {
      return null;
    }

    try {
      return this.crypto.decrypt(encrypted);
    } catch {
      // В лог — предупреждение; в журнал — ничего: чтение настройки не
      // действие субъекта (дизайн, 3.7). Причина не пишется: в тексте
      // ошибки расшифровки бывают части шифротекста.
      this.logger.warn(
        'Ключ службы модели не расшифровывается: проверьте CAIRN_ENCRYPTION_KEY.',
      );

      return null;
    }
  }
}
