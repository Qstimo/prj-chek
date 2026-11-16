import { AccessLevel, Section, tagSlug, type Tag } from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, notExists, sql } from 'drizzle-orm';

import { SectionNotVisibleError } from '../access/access.errors';
import { AccessService, meets } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { DATABASE } from '../db/db.module';
import type { Database, Executor } from '../db/db.types';
import { projectTags, projects, tags, type TagRow } from '../db/schema';

/**
 * Теги проектов: верхнеуровневые метки сводки (ТЗ 3.1).
 *
 * Тег — поле паспорта, поэтому права проверяются по секции «Инфо», как у
 * платформ. Сам реестр тегов своего права не имеет: он наполняется тем,
 * что теги кому-то приписали, и раскрывается ровно в той мере, в какой
 * видны паспорта проектов.
 */
@Injectable()
export class TagsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly access: AccessService,
  ) {}

  /**
   * Заменяет набор тегов проекта целиком.
   *
   * Целиком, а не по одному: за тегом ничего не стоит, и правка набора —
   * одно действие в одной форме. Теги, которых в новом наборе нет,
   * снимаются, а оставшиеся без единой связи уносятся из реестра.
   */
  async set(
    subject: RequestSubject,
    tx: Executor,
    projectId: string,
    labels: string[],
  ): Promise<Tag[]> {
    await this.access.requireLevel(subject, projectId, Section.Info, AccessLevel.Write, tx);

    // Существование проверяется отдельно: суперадмину уровень выдаётся
    // без обращения к выдачам, и у несуществующего проекта запись упёрлась
    // бы в внешний ключ пятисоткой вместо честного «не видно».
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      throw new SectionNotVisibleError();
    }

    // Повторы и пустые названия отвергает схема, но точка контроля —
    // репозиторий: он единственный путь к данным (спека 5.4).
    const wanted = new Map<string, string>();

    for (const label of labels) {
      const slug = tagSlug(label);

      if (slug.length > 0 && !wanted.has(slug)) {
        wanted.set(slug, label.trim());
      }
    }

    const chosen = await this.ensureRegistered(tx, wanted);
    await this.relink(tx, projectId, chosen);

    return chosen.map(tagProjection).sort(byLabel);
  }

  /**
   * Теги набора проектов, сгруппированные по проекту.
   *
   * Субъекта не принимает, как `PlatformsRepository.setEnvironmentPlatforms`:
   * зовётся из репозитория проектов, который уже отобрал видимые проекты и
   * сам решает, какому уровню доступа теги показать.
   */
  async forProjects(executor: Executor, projectIds: string[]): Promise<Map<string, Tag[]>> {
    const result = new Map<string, Tag[]>();

    if (projectIds.length === 0) {
      return result;
    }

    const rows = await executor
      .select({
        projectId: projectTags.projectId,
        id: tags.id,
        slug: tags.slug,
        label: tags.label,
      })
      .from(projectTags)
      .innerJoin(tags, eq(tags.id, projectTags.tagId))
      .where(inArray(projectTags.projectId, projectIds));

    for (const row of rows) {
      const list = result.get(row.projectId) ?? [];
      list.push({ id: row.id, slug: row.slug, label: row.label });
      result.set(row.projectId, list);
    }

    for (const list of result.values()) {
      list.sort(byLabel);
    }

    return result;
  }

  /**
   * Теги, встречающиеся в видимых субъекту паспортах.
   *
   * Нужен подсказкам в форме проекта: без общего словаря свободные теги
   * расходятся — рядом с «Web» появляется «Вэб», и фильтр делит сводку
   * вместо того, чтобы её собирать.
   *
   * Гейт тот же, что у тегов в сводке: проект, видимый только через
   * роадмап, своих меток не раскрывает.
   */
  async vocabulary(subject: RequestSubject): Promise<Tag[]> {
    const ids = await this.access.visibleProjectIds(subject);

    if (ids.length === 0) {
      return [];
    }

    const levels = await this.access.levelsForProjects(subject, ids);
    const allowed = ids.filter((id) =>
      meets(levels.get(id)?.[Section.Info], AccessLevel.Metadata),
    );

    if (allowed.length === 0) {
      return [];
    }

    const rows = await this.db
      .selectDistinct({ id: tags.id, slug: tags.slug, label: tags.label })
      .from(tags)
      .innerJoin(projectTags, eq(projectTags.tagId, tags.id))
      .where(inArray(projectTags.projectId, allowed));

    return rows.sort(byLabel);
  }

  /**
   * Доводит реестр до состояния, в котором есть все нужные теги.
   *
   * `onConflictDoNothing` по `slug`, а не «выбрать и дописать отсутствующие»:
   * между выборкой и вставкой тот же тег мог завести соседний запрос, и
   * вторая вставка упёрлась бы в уникальный ключ.
   *
   * Название уже заведённого тега не переписывается: правка одного проекта
   * не должна менять то, что видно в соседнем.
   */
  private async ensureRegistered(
    tx: Executor,
    wanted: Map<string, string>,
  ): Promise<TagRow[]> {
    if (wanted.size === 0) {
      return [];
    }

    await tx
      .insert(tags)
      .values([...wanted].map(([slug, label]) => ({ slug, label })))
      .onConflictDoNothing({ target: tags.slug });

    return tx
      .select()
      .from(tags)
      .where(inArray(tags.slug, [...wanted.keys()]));
  }

  /** Приводит связи проекта к выбранному набору и убирает осиротевшие теги. */
  private async relink(tx: Executor, projectId: string, chosen: TagRow[]): Promise<void> {
    const current = await tx
      .select({ tagId: projectTags.tagId })
      .from(projectTags)
      .where(eq(projectTags.projectId, projectId));

    const currentIds = new Set(current.map((row) => row.tagId));
    const wantedIds = new Set(chosen.map((row) => row.id));

    const added = [...wantedIds].filter((id) => !currentIds.has(id));
    const removed = [...currentIds].filter((id) => !wantedIds.has(id));

    if (added.length > 0) {
      await tx.insert(projectTags).values(added.map((tagId) => ({ projectId, tagId })));
    }

    if (removed.length === 0) {
      return;
    }

    await tx
      .delete(projectTags)
      .where(and(eq(projectTags.projectId, projectId), inArray(projectTags.tagId, removed)));

    // Тег без единой связи не отвечает ни на один вопрос, а в чипах
    // фильтра стоял бы кнопкой, не отбирающей ничего. Условие проверяется
    // в самом запросе: выборка «а остался ли он у кого-то» и следующее
    // за ней удаление разошлись бы с параллельной правкой соседа.
    await tx.delete(tags).where(
      and(
        inArray(tags.id, removed),
        notExists(
          tx
            .select({ one: sql`1` })
            .from(projectTags)
            .where(eq(projectTags.tagId, tags.id)),
        ),
      ),
    );
  }
}

/** Приводит строку реестра к контракту: наружу не уходит отметка времени. */
function tagProjection(row: TagRow): Tag {
  return { id: row.id, slug: row.slug, label: row.label };
}

/**
 * Порядок тегов — по показываемому названию.
 *
 * В приложении, а не в `ORDER BY`: порядок чипов не должен зависеть от
 * collation базы, иначе он разойдётся между машиной разработчика и
 * сервером. Сравнение русское — интерфейс русский, — и это значит, что
 * кириллица идёт впереди латиницы: «Продукт», затем «Web».
 */
function byLabel(left: Tag, right: Tag): number {
  return left.label.localeCompare(right.label, 'ru');
}
