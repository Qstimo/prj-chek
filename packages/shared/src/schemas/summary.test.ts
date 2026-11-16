import { describe, expect, it } from 'vitest';

import { SummaryTaskOrigin } from '../enums';
import {
  MAX_SUMMARY_TASKS,
  normalizeSummaryText,
  summaryCreateSchema,
  summaryDetailSchema,
  summaryTasksReplaceSchema,
  summarySuggesterStampSchema,
} from './summary';

const ID = '00000000-0000-0000-0000-000000000001';

/** Минимально полная деталь: от неё отталкиваются точечные проверки. */
const DETAIL = {
  id: ID,
  projectId: ID,
  projectName: 'CAIRN',
  occurredOn: '2026-11-16',
  title: 'Созвон по релизу',
  taskCount: 0,
  isReleased: false,
  releasedVersionLabel: null,
  createdAt: '2026-11-16T10:00:00.000Z',
  chronicleEntryId: ID,
  text: 'текст',
  tasks: [],
  suggester: null,
  releasedVersionId: null,
  isTextStale: false,
  suggestedVersionLabel: null,
};

describe('создание саммари', () => {
  it('принимает дату, заголовок и текст', () => {
    expect(() =>
      summaryCreateSchema.parse({ occurredOn: '2026-11-16', title: 'Созвон', text: 'текст' }),
    ).not.toThrow();
  });

  it('отвергает пустой текст', () => {
    expect(() =>
      summaryCreateSchema.parse({ occurredOn: '2026-11-16', title: 'Созвон', text: '   ' }),
    ).toThrow();
  });

  it('отвергает текст длиннее предела записи хроники', () => {
    // Предел взят оттуда, куда текст поедет: 65 536 у
    // `chronicleEntryCreate.content`. Иначе отказ пришёл бы не оттуда,
    // где его ждут.
    expect(() =>
      summaryCreateSchema.parse({
        occurredOn: '2026-11-16',
        title: 'Созвон',
        text: 'я'.repeat(65_537),
      }),
    ).toThrow();
  });

  it('отвергает пустую дату события', () => {
    expect(() =>
      summaryCreateSchema.parse({ occurredOn: null, title: 'Созвон', text: 'текст' }),
    ).toThrow();
  });

  it('отвергает лишнее поле', () => {
    // Строгая схема: лишний ключ — опечатка клиента, а не вольность.
    expect(() =>
      summaryCreateSchema.parse({
        occurredOn: '2026-11-16',
        title: 'Созвон',
        text: 'текст',
        projectId: ID,
      }),
    ).toThrow();
  });
});

describe('замена черновика', () => {
  it('строка без id — новая, набранная человеком', () => {
    const parsed = summaryTasksReplaceSchema.parse({ tasks: [{ title: 'Сделать' }] });

    expect(parsed.tasks[0]?.id).toBeUndefined();
  });

  it('позиции не принимаются: порядок задаёт порядок массива', () => {
    // Второе место для порядка разошлось бы с первым.
    expect(() =>
      summaryTasksReplaceSchema.parse({ tasks: [{ title: 'Сделать', position: 1 }] }),
    ).toThrow();
  });

  it('отвергает пустую формулировку', () => {
    expect(() => summaryTasksReplaceSchema.parse({ tasks: [{ title: '  ' }] })).toThrow();
  });

  it('отвергает формулировку длиннее чекпоинта', () => {
    expect(() =>
      summaryTasksReplaceSchema.parse({ tasks: [{ title: 'я'.repeat(301) }] }),
    ).toThrow();
  });

  it('отвергает массив длиннее предела формы', () => {
    const tasks = Array.from({ length: MAX_SUMMARY_TASKS + 1 }, () => ({ title: 'Сделать' }));

    expect(() => summaryTasksReplaceSchema.parse({ tasks })).toThrow();
  });

  it('пустой массив законен: черновик очищают перед новой разбивкой', () => {
    expect(summaryTasksReplaceSchema.parse({ tasks: [] }).tasks).toEqual([]);
  });
});

describe('деталь саммари', () => {
  it('подсказка обозначения версии может отсутствовать', () => {
    // `null` значит «подставлять нечего»: версий нет, в обозначениях нет
    // цифр, или у субъекта нет выдачи на роадмап.
    expect(summaryDetailSchema.parse(DETAIL).suggestedVersionLabel).toBeNull();
  });

  it('несёт признак устаревшего текста', () => {
    expect(summaryDetailSchema.parse({ ...DETAIL, isTextStale: true }).isTextStale).toBe(true);
  });

  it('задача несёт происхождение', () => {
    const parsed = summaryDetailSchema.parse({
      ...DETAIL,
      tasks: [{ id: ID, title: 'Сделать', position: 1, origin: SummaryTaskOrigin.Model }],
    });

    expect(parsed.tasks[0]?.origin).toBe(SummaryTaskOrigin.Model);
  });
});

describe('нормализация текста', () => {
  it('снимает один ведущий BOM', () => {
    expect(normalizeSummaryText('﻿текст')).toBe('текст');
  });

  it('второй BOM остаётся символом текста, а не снимается молча', () => {
    expect(normalizeSummaryText('﻿﻿текст')).toBe('﻿текст');
  });

  it('приводит переводы строк к LF', () => {
    // Иначе один и тот же текст менял бы длину от платформы автора.
    expect(normalizeSummaryText('раз\r\nдва')).toBe('раз\nдва');
  });

  it('оставляет перевод строки и табуляцию', () => {
    expect(normalizeSummaryText('раз\n\tдва')).toBe('раз\n\tдва');
  });

  it('отвергает NUL', () => {
    // До колонки `text` в PostgreSQL он не доходит вовсе.
    expect(() => normalizeSummaryText('раз\u0000два')).toThrow();
  });

  it('отвергает прочие управляющие символы, а не чистит молча', () => {
    // Текст созвона — то, что прислал человек; подменять его тихо нельзя.
    expect(() => normalizeSummaryText('раз\u0007два')).toThrow();
  });
});

describe('число отброшенных в отметке разбивки', () => {
  const stamp = { name: 'local', model: 'модель', at: '2026-11-16T10:00:00Z' };

  it.each([0, 7, null])('сохраняет значение %s, включая неизвестное у старой разбивки', (dropped) => {
    expect(summarySuggesterStampSchema.parse({ ...stamp, dropped })).toEqual({ ...stamp, dropped });
  });

  it.each([-1, 1.5, '7', undefined])('отвергает негодное или отсутствующее число %s', (dropped) => {
    expect(() => summarySuggesterStampSchema.parse({ ...stamp, dropped })).toThrow();
  });
});
