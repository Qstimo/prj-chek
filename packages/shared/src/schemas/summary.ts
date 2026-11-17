import { z } from 'zod';

import { SummaryTaskOrigin, TaskSuggesterKind } from '../enums';
import { requiredDaySchema } from './day-date';
import { HAS_NUL, isNulFree } from './plain-text';

/** Разбивка не настроена: ни адреса, ни ключа. */
export const SUGGESTER_DISABLED = 'suggester_disabled';
/** Текст длиннее предела, который принимает предложитель. */
export const SUMMARY_TEXT_TOO_LONG = 'summary_text_too_long';
/** Предложитель не ответил или ответил негодным. */
export const SUGGESTER_UNAVAILABLE = 'suggester_unavailable';
/** Релиз по этому саммари уже сформирован. */
export const SUMMARY_ALREADY_RELEASED = 'summary_already_released';
/** Черновик пуст: формировать релиз не из чего. */
export const SUMMARY_TASKS_EMPTY = 'summary_tasks_empty';
/** В тексте управляющие символы: его прислали в непригодном виде. */
export const SUMMARY_TEXT_NOT_PLAIN = 'summary_text_not_plain';

/** Предел числа задач в черновике: предел формы, а не доверия к модели. */
export const MAX_SUMMARY_TASKS = 200;

/** Управляющие символы, кроме перевода строки и табуляции. */
const FORBIDDEN_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/**
 * Приводит текст саммари к пригодному виду или отказывает.
 *
 * Общая функция для браузера и сервера: нормализовать по-разному значило
 * бы отправить наружу не то, что сохранено. Снимается один ведущий BOM
 * (его ставят редакторы Windows) и `CRLF`; управляющие символы —
 * **отказ**, а не чистка: подменять присланный человеком текст молча
 * нельзя. По длине тоже не обрезаем — отказ с настоящим числом даёт
 * человеку решить, что выбросить.
 */
export function normalizeSummaryText(raw: string): string {
  const text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

  if (FORBIDDEN_CONTROL.test(text)) {
    throw new Error(SUMMARY_TEXT_NOT_PLAIN);
  }

  return text;
}

/** Предел объёма текста в контракте: столько принимает запись хроники. */
const summaryTextSchema = z.string().trim().min(1).max(65_536);

/** Задача черновика: формулировка, порядок, происхождение. */
export const summaryTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  position: z.number().int().positive(),
  origin: z.nativeEnum(SummaryTaskOrigin),
});

/** Чем построена текущая разбивка. Ключ API здесь не бывает никогда. */
export const summarySuggesterStampSchema = z.object({
  name: z.string(),
  model: z.string(),
  at: z.string(),
  /** null у прежних разбивок: историческое число не восстанавливается. */
  dropped: z.number().int().nonnegative().nullable(),
});

/** Строка истории саммари. */
export const summaryListItemSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  projectName: z.string(),
  /** Дата и заголовок приходят из записи хроники. День обязателен. */
  occurredOn: requiredDaySchema,
  title: z.string(),
  taskCount: z.number().int().nonnegative(),
  /** Релиз сформирован. Видно всегда: это состояние потока, а не роадмапа. */
  isReleased: z.boolean(),
  /**
   * Обозначение версии-получателя — только при `Roadmap ≥ metadata`.
   *
   * Отдельно от `isReleased`: обозначение версии — данные роадмапа, и
   * субъекту без выдачи на него оно не выходит. Без разделения «не
   * сформирован» было бы неотличимо от «сформирован, обозначение скрыто».
   */
  releasedVersionLabel: z.string().nullable(),
  createdAt: z.string(),
});

/** Саммари целиком: текст, черновик, подсказка обозначения версии. */
export const summaryDetailSchema = summaryListItemSchema.extend({
  /** Запись хроники с текстом: правка идёт её собственной ручкой. */
  chronicleEntryId: z.string().uuid(),
  text: z.string(),
  tasks: z.array(summaryTaskSchema),
  suggester: summarySuggesterStampSchema.nullable(),
  releasedVersionId: z.string().uuid().nullable(),
  /**
   * Запись правили после того, как построена разбивка.
   *
   * Предупреждение, а не отказ: судит человек, он видит и текст, и
   * задачи. Флажок грубый — его двигает любая правка записи, включая
   * правку заголовка (дизайн, раздел 2.5).
   */
  isTextStale: z.boolean(),
  /**
   * Следующее обозначение версии, выведенное из существующих.
   *
   * `null` означает «подставлять нечего»: версий нет, их обозначения не
   * содержат чисел, или у субъекта нет выдачи на роадмап.
   */
  suggestedVersionLabel: z.string().nullable(),
});

/**
 * Создание саммари: дата, заголовок, текст.
 *
 * Текст приводит к пригодному виду {@link normalizeSummaryText} — и в
 * браузере, и на сервере. Заголовку хватает запрета нулевого байта: он
 * уезжает в ту же колонку, что у рукописной записи хроники, и наружу к
 * модели не уходит вовсе.
 */
export const summaryCreateSchema = z
  .object({
    occurredOn: requiredDaySchema,
    title: z.string().trim().min(1).max(300).refine(isNulFree, HAS_NUL),
    text: summaryTextSchema,
  })
  .strict();

/**
 * Замена черновика целиком.
 *
 * Строка с `id` — оставить существующую (вместе с её происхождением), без
 * `id` — новая, набранная человеком. Позиции не принимаются: порядок задаёт
 * порядок массива, и второе место для порядка разошлось бы с первым.
 */
export const summaryTasksReplaceSchema = z
  .object({
    tasks: z
      .array(
        z
          .object({
            id: z.string().uuid().optional(),
            title: z.string().trim().min(1).max(300),
          })
          .strict(),
      )
      .max(MAX_SUMMARY_TASKS),
  })
  .strict();

/** Результат формирования релиза: куда уехали задачи. */
export const summaryReleaseResultSchema = z.object({
  versionId: z.string().uuid(),
  label: z.string(),
  checkpointCount: z.number().int().positive(),
});

/** Настройки предложителя, видимые пользователю. Ключа здесь нет. */
export const taskSuggesterInfoSchema = z.object({
  isEnabled: z.boolean(),
  /** `external` или `local`: куда уходит текст. */
  kind: z.nativeEnum(TaskSuggesterKind),
  /** Имя узла из настроенного адреса, без пути и без ключа. */
  host: z.string().nullable(),
  model: z.string().nullable(),
  maxChars: z.number().int().positive(),
});

/** Тип данных контракта саммари. */
export type SummaryTask = z.infer<typeof summaryTaskSchema>;

/** Тип данных контракта саммари. */
export type SummarySuggesterStamp = z.infer<typeof summarySuggesterStampSchema>;

/** Тип данных контракта саммари. */
export type SummaryListItem = z.infer<typeof summaryListItemSchema>;

/** Тип данных контракта саммари. */
export type SummaryDetail = z.infer<typeof summaryDetailSchema>;

/** Тип данных контракта саммари. */
export type SummaryCreate = z.infer<typeof summaryCreateSchema>;

/** Тип данных контракта саммари. */
export type SummaryTasksReplace = z.infer<typeof summaryTasksReplaceSchema>;

/** Тип данных контракта саммари. */
export type SummaryReleaseResult = z.infer<typeof summaryReleaseResultSchema>;

/** Тип данных контракта саммари. */
export type TaskSuggesterInfo = z.infer<typeof taskSuggesterInfoSchema>;
