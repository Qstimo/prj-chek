import { SummaryTaskOrigin } from '@cairn/shared';
import { getTableConfig } from 'drizzle-orm/pg-core';
import type { PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { roadmapCheckpoints } from './roadmap';
import { summaries, summaryTaskDrafts, summaryTaskOriginEnum, summaryTaskPlatforms } from './summaries';

/** Имена колонок таблицы: проверки состава читают именно их. */
function columnNames(table: PgTable): string[] {
  return getTableConfig(table).columns.map((column) => column.name);
}

/** Имена индексов таблицы. */
function indexNames(table: PgTable): string[] {
  return getTableConfig(table).indexes.map((index) => index.config.name ?? '');
}

/** Колонки индекса по порядку, с направлением каждой. */
function columnsOf(table: PgTable, name: string): [string, string | undefined][] {
  const index = getTableConfig(table).indexes.find(
    (candidate) => candidate.config.name === name,
  );

  return (index?.config.columns ?? []).map((column) => {
    const { name: columnName, indexConfig } = column as {
      name?: string;
      indexConfig?: { order?: string };
    };

    return [columnName ?? '', indexConfig?.order];
  });
}

describe('саммари', () => {
  it('ссылается на запись хроники, а не копирует текст', () => {
    // Вторая копия текста разошлась бы с первой при первой же правке.
    const columns = columnNames(summaries);

    expect(columns).toEqual(
      expect.arrayContaining(['project_id', 'chronicle_entry_id', 'released_version_id']),
    );
    expect(columns).not.toContain('text');
    expect(columns).not.toContain('content');
  });

  it('у записи хроники не больше одного саммари', () => {
    // Два черновика над одним текстом не отвечают на вопрос «какой
    // из них настоящий».
    expect(summaries.chronicleEntryId.isUnique).toBe(true);
  });

  it('помнит, чем и по какому тексту построена разбивка', () => {
    expect(columnNames(summaries)).toEqual(
      expect.arrayContaining([
        'suggester_name',
        'suggester_model',
        'suggested_at',
        'suggested_text_at',
      ]),
    );
  });

  it('стадии потока в таблице нет: она вычисляется', () => {
    // Хранимая стадия разошлась бы с содержимым при первом удалении
    // последней задачи.
    expect(columnNames(summaries)).not.toContain('state');
  });

  it('удалённая версия не делает саммари неудаляемым', () => {
    // `restrict` запер бы саммари из-за версии, в которую задачи уже
    // уехали; «ушло в версию, которой больше нет» честнее молчания.
    const link = getTableConfig(summaries).foreignKeys.find((candidate) =>
      candidate.reference().columns.some((column) => column.name === 'released_version_id'),
    );

    expect(link?.onDelete).toBe('set null');
  });

  it('читается по своему индексу: свежие сверху', () => {
    // Состав и порядок колонок, а не одно имя: индекс по тем же полям в
    // другом порядке — другой индекс, а без `desc` у даты «свежие
    // сверху» достаётся сортировке, а не чтению.
    expect(columnsOf(summaries, 'summaries_project_created_idx')).toEqual([
      ['project_id', 'asc'],
      ['created_at', 'desc'],
    ]);
  });
});

describe('черновик задач', () => {
  it('перечисление происхождения совпадает с контрактом', () => {
    expect(summaryTaskOriginEnum.enumValues).toEqual(Object.values(SummaryTaskOrigin));
  });

  it('не богаче чекпоинта: своих полей у задачи нет', () => {
    // ТЗ 1.4 остаётся в силе, а дизайн 2.1 отменён только в части двух
    // полей, которые у чекпоинта есть. Сторож считает разницу составов,
    // а не перечисляет запреты: перечисление пропустило бы поле, которое
    // никому не пришло в голову запретить.
    const own = columnNames(summaryTaskDrafts).filter(
      (column) => !columnNames(roadmapCheckpoints).includes(column),
    );

    expect(own.sort()).toEqual(['summary_id', 'origin'].sort());
  });

  it('ссылка на задачу во внешнем трекере есть и необязательна', () => {
    expect(columnNames(summaryTaskDrafts)).toContain('url');
    expect(summaryTaskDrafts.url.notNull).toBe(false);
  });

  it('ни исполнителя, ни оценки, ни даты, ни вложенности', () => {
    const columns = columnNames(summaryTaskDrafts);

    expect(columns).not.toContain('assignee_id');
    expect(columns).not.toContain('estimate');
    expect(columns).not.toContain('due_on');
    expect(columns).not.toContain('parent_id');
  });

  it('ссылки не каскадные: уборка явная', () => {
    // Каскадов в проекте нет — строки уносит репозиторий.
    expect(getTableConfig(summaryTaskDrafts).foreignKeys[0]?.onDelete).toBe('restrict');
  });

  it('читается по своему индексу в порядке позиций', () => {
    // Порядок колонок проверяется, а не просто «индекс не уникальный»:
    // `(position, summary_id)` чтению черновика одного саммари не
    // помогает, а уникальность позиций внутри саммари **не выражается**
    // намеренно — их целиком перенумеровывает `PUT …/tasks`.
    expect(columnsOf(summaryTaskDrafts, 'summary_task_drafts_summary_idx')).toEqual([
      ['summary_id', 'asc'],
      ['position', 'asc'],
    ]);
    expect(
      getTableConfig(summaryTaskDrafts).indexes.find(
        (candidate) => candidate.config.name === 'summary_task_drafts_summary_idx',
      )?.config.unique,
    ).toBe(false);
  });
});

describe('теги платформ у задачи черновика', () => {
  it('пара и есть сущность: составной первичный ключ', () => {
    // Своего `id` нет — второй экземпляр пары бессмыслен. Зеркало
    // `checkpoint_platforms`.
    const [primary] = getTableConfig(summaryTaskPlatforms).primaryKeys;

    expect(primary?.columns.map((column) => column.name)).toEqual(['draft_id', 'platform_id']);
  });

  it('ссылки не каскадные: уборка явная в пяти местах', () => {
    expect(getTableConfig(summaryTaskPlatforms).foreignKeys.map((key) => key.onDelete)).toEqual([
      'restrict',
      'restrict',
    ]);
  });

  it('индекс по платформе есть: за удалённой платформой уносят теги', () => {
    expect(indexNames(summaryTaskPlatforms)).toContain('summary_task_platforms_platform_idx');
  });

  it('имена внешних ключей умещаются в предел PostgreSQL', () => {
    // 63 байта. Длиннее — PostgreSQL молча обрежет, и в снапшоте
    // останется одно имя, а в базе другое (см. роадмап, carried_from).
    for (const key of getTableConfig(summaryTaskPlatforms).foreignKeys) {
      expect(key.getName().length).toBeLessThanOrEqual(63);
    }
  });
});
