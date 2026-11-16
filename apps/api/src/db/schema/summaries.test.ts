import { SummaryTaskOrigin } from '@cairn/shared';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { summaries, summaryTaskDrafts, summaryTaskOriginEnum } from './summaries';

/** Имена колонок таблицы: проверки состава читают именно их. */
function columnNames(table: typeof summaries | typeof summaryTaskDrafts): string[] {
  return getTableConfig(table).columns.map((column) => column.name);
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
    expect(getTableConfig(summaries).indexes.map((index) => index.config.name)).toContain(
      'summaries_project_created_idx',
    );
  });
});

describe('черновик задач', () => {
  it('перечисление происхождения совпадает с контрактом', () => {
    expect(summaryTaskOriginEnum.enumValues).toEqual(Object.values(SummaryTaskOrigin));
  });

  it('беднее чекпоинта: ни адреса, ни платформ, ни даты', () => {
    // ТЗ 1.4 и дизайн 2.1: расширить роадмап через эту дверь нельзя
    // физически.
    const columns = columnNames(summaryTaskDrafts);

    expect(columns).toEqual(expect.arrayContaining(['summary_id', 'title', 'position', 'origin']));
    expect(columns).not.toContain('url');
    expect(columns).not.toContain('assignee_id');
    expect(columns).not.toContain('due_on');
    expect(columns).not.toContain('parent_id');
  });

  it('ссылки не каскадные: уборка явная', () => {
    // Каскадов в проекте нет — строки уносит репозиторий.
    expect(getTableConfig(summaryTaskDrafts).foreignKeys[0]?.onDelete).toBe('restrict');
  });

  it('читается по своему индексу в порядке позиций', () => {
    const index = getTableConfig(summaryTaskDrafts).indexes.find(
      (candidate) => candidate.config.name === 'summary_task_drafts_summary_idx',
    );

    expect(index?.config.unique).toBe(false);
  });
});
