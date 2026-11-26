import {
  AccessLevel,
  Section,
  TrackerKind,
  type TrackerBinding,
  type TrackerBindingUpdate,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { DATABASE } from '../db/db.module';
import type { Database, Executor, Transaction } from '../db/db.types';
import { projects, subjects, trackerProjectBindings } from '../db/schema';

/**
 * Привязка проекта к доске трекера: куда выгружать его задачи.
 *
 * Право — **«Роадмап»**, и новой единицы выдачи доступа не появилось:
 * привязка отвечает на вопрос «куда поедут наши задачи», а задача
 * принадлежит роадмапу (дизайн, 4). Чтение — видеть, куда настроено;
 * запись — менять это.
 *
 * Субъект в подписи каждого метода, и проверка внутри, тем же
 * исполнителем, которым идёт работа: право проверяется на уровне выборки
 * данных (ТЗ 4.1), а обращение к другому подключению внутри транзакции
 * увидело бы состояние до неё.
 */
@Injectable()
export class TrackerBindingsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly access: AccessService,
  ) {}

  /** Привязка проекта либо `null`: её отсутствие — состояние, а не отказ. */
  async findForProject(
    subject: RequestSubject,
    projectId: string,
    executor: Executor = this.db,
  ): Promise<TrackerBinding | null> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Read, executor);

    const [row] = await executor
      .select({ binding: trackerProjectBindings, updatedByLabel: subjects.label })
      .from(trackerProjectBindings)
      .innerJoin(subjects, eq(subjects.id, trackerProjectBindings.updatedBySubjectId))
      .where(eq(trackerProjectBindings.projectId, projectId))
      .limit(1);

    return row
      ? {
          tracker: row.binding.tracker,
          externalProjectId: row.binding.externalProjectId,
          boardId: row.binding.boardId,
          boardColumnId: row.binding.boardColumnId,
          updatedAt: row.binding.updatedAt.toISOString(),
          updatedByLabel: row.updatedByLabel,
        }
      : null;
  }

  /**
   * Ставит привязку проекта целиком.
   *
   * `ON CONFLICT (project_id) DO UPDATE`: трекер на установку один (дизайн,
   * 10.1), привязка у проекта одна, и вторая строка означала бы два ответа
   * на вопрос «куда выгружать».
   *
   * Правится целиком, а не полем: все три идентификатора связаны — колонка
   * принадлежит доске, доска проекту, — и правка одного поля оставила бы
   * привязку, указывающую на колонку чужой доски.
   */
  async save(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    input: TrackerBindingUpdate,
  ): Promise<void> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);
    await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .for('no key update');

    const fields = {
      // Вид трекера задаёт **путь**, а не тело: трекер на установку один, и
      // присланный вид описывал бы настройку, которой нет.
      tracker: TrackerKind.Weeek,
      externalProjectId: input.externalProjectId,
      boardId: input.boardId,
      boardColumnId: input.boardColumnId,
      updatedBySubjectId: subject.id,
      updatedAt: new Date(),
    };

    await tx
      .insert(trackerProjectBindings)
      .values({ projectId, ...fields })
      .onConflictDoUpdate({ target: trackerProjectBindings.projectId, set: fields });
  }

  /**
   * Уносит привязки всех проектов к этому виду трекера.
   *
   * **Без субъекта, и это названное исключение из правила ТЗ 4.1**, как у
   * обхода прогона: действие принадлежит не проекту, а установке — его
   * делает суперадмин, снимая подключение, и выдачи на все проекты разом
   * ему не выписать. Проверка права при этом не исчезает, а стоит выше, у
   * ручки подключения (`SuperadminGuard`): привязка — дорога к настройке,
   * которой уже не будет.
   *
   * Почему привязки вообще уносятся. Доска мёртвого пространства дала бы
   * названный отказ при первой же выгрузке, то есть вред был бы мягким; но
   * до него панель проекта говорила бы «доска выбрана: задачи проекта уедут
   * в неё» — утверждение, которое после смены пространства уже неверно.
   * Снятая привязка честно читается как «выбрать заново», и чинит её тот же
   * человек на том же экране.
   */
  async removeForTracker(tx: Transaction, tracker: TrackerKind): Promise<void> {
    await tx.delete(trackerProjectBindings).where(eq(trackerProjectBindings.tracker, tracker));
  }

  /**
   * Право записи на «Роадмап» проекта либо отказ.
   *
   * Отдельно от чтения и записи привязки, потому что нужно третьему
   * действию — чтению живых списков трекера: оно ничего не читает из нашей
   * базы, но спрашивать чужой API нашим токеном вправе лишь тот, кто
   * привязку и ставит. Проверка стоит здесь, в репозитории, а не в службе,
   * чтобы единственное место проверки прав осталось единственным.
   */
  async requireWrite(subject: RequestSubject, projectId: string): Promise<void> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write);
  }
}
